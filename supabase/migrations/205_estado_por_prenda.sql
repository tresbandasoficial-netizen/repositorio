-- 205: estado POR PRENDA dentro del mismo pedido.
-- El pedido sigue siendo uno (número, total, saldo, mensaje al cliente); cada
-- prenda lleva su propio estado porque llegan en tiempos distintos. El estado
-- del pedido es el de su prenda MÁS ATRASADA (así las alertas siguen vivas
-- hasta que llegue todo).
--   · Cambiar el pedido completo (cambiar_estado_pedido) mueve sus prendas.
--   · cambiar_estado_prendas mueve solo las prendas indicadas.
-- Revertir: drop de las funciones nuevas y del trigger, `alter table
-- pedido_items drop column estado`, `alter table envio_items drop column
-- pedido_item_id`, y volver a aplicar las definiciones anteriores de
-- cambiar_estado_pedido, editar_pedido, separar_pedido_por_articulos,
-- asignar_parcial_compra_item y marcar_envios_santa_rosa_auto.

-- ── 1. Orden de avance de los estados ────────────────────────────────────────
create or replace function public.orden_estado_pedido(p_estado text)
returns int
language sql
immutable
as $$
  select case p_estado
    when 'pendiente'   then 1
    when 'comprado'    then 2
    when 'usa'         then 3
    when 'bucaramanga' then 4
    when 'santa_rosa'  then 5
    when 'entregado'   then 6
    when 'cancelado'   then 99
    else 0
  end
$$;

-- ── 2. Columna estado en pedido_items ────────────────────────────────────────
alter table public.pedido_items add column if not exists estado text;

update public.pedido_items pi
set estado = p.estado
from public.pedidos p
where p.id = pi.pedido_id and pi.estado is null;

-- Toda prenda nueva nace con el estado de su pedido.
create or replace function public.pedido_item_estado_inicial()
returns trigger
language plpgsql
as $$
begin
  if new.estado is null then
    select estado into new.estado from public.pedidos where id = new.pedido_id;
    new.estado := coalesce(new.estado, 'pendiente');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pedido_item_estado_inicial on public.pedido_items;
create trigger trg_pedido_item_estado_inicial
  before insert on public.pedido_items
  for each row execute function public.pedido_item_estado_inicial();

alter table public.pedido_items alter column estado set not null;
alter table public.pedido_items drop constraint if exists pedido_items_estado_check;
alter table public.pedido_items add constraint pedido_items_estado_check
  check (estado in ('pendiente', 'comprado', 'usa', 'bucaramanga', 'santa_rosa', 'entregado', 'cancelado'));

-- Qué prenda viajó en cada renglón de un envío (etiqueta TR7900-1 → prenda 1).
alter table public.envio_items
  add column if not exists pedido_item_id uuid references public.pedido_items(id) on delete set null;

-- ── 3. Estado del pedido = su prenda más atrasada ────────────────────────────
create or replace function public.recalcular_estado_pedido(p_pedido_id uuid, p_usuario_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actual text;
  v_nuevo  text;
begin
  select estado into v_actual from pedidos where id = p_pedido_id for update;
  if not found or v_actual = 'cancelado' then
    return v_actual;
  end if;

  select estado into v_nuevo
  from pedido_items
  where pedido_id = p_pedido_id and estado <> 'cancelado'
  order by orden_estado_pedido(estado)
  limit 1;

  if v_nuevo is null or v_nuevo = v_actual then
    return v_actual;
  end if;

  update pedidos set estado = v_nuevo where id = p_pedido_id;

  -- historial_cambios.usuario_id es obligatorio: sin usuario no hay constancia.
  if p_usuario_id is not null then
    insert into historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id)
    values ('pedidos', p_pedido_id, 'estado', v_actual, v_nuevo, p_usuario_id);
  end if;

  return v_nuevo;
end;
$$;

-- ── 4. Cambiar el estado de SOLO algunas prendas ─────────────────────────────
create or replace function public.cambiar_estado_prendas(
  p_pedido_id    uuid,
  p_item_ids     uuid[],
  p_nuevo_estado text,
  p_usuario_id   uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
  v_n      int;
  r        record;
begin
  select estado into v_estado from pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Pedido no encontrado: %', p_pedido_id;
  end if;
  if v_estado = 'cancelado' then
    raise exception 'El pedido está cancelado, no se puede cambiar';
  end if;
  if v_estado = 'entregado' then
    raise exception 'El pedido ya se entregó';
  end if;
  if p_nuevo_estado not in ('pendiente', 'comprado', 'usa', 'bucaramanga', 'santa_rosa') then
    raise exception 'Una prenda sola solo pasa a pendiente, comprado, USA, Bucaramanga o Santa Rosa — entregar y cancelar se hacen por el pedido';
  end if;
  if coalesce(array_length(p_item_ids, 1), 0) = 0 then
    raise exception 'No se indicó ninguna prenda';
  end if;

  select count(*) into v_n
  from pedido_items
  where pedido_id = p_pedido_id and id = any(p_item_ids);
  if v_n <> (select count(distinct x) from unnest(p_item_ids) x) then
    raise exception 'Alguna prenda no pertenece al pedido — recarga la página';
  end if;

  for r in
    select id, estado from pedido_items
    where pedido_id = p_pedido_id and id = any(p_item_ids) and estado <> p_nuevo_estado
    for update
  loop
    update pedido_items set estado = p_nuevo_estado where id = r.id;
    insert into historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id)
    values ('pedido_items', r.id, 'estado', r.estado, p_nuevo_estado, p_usuario_id);
  end loop;

  -- Actividad en el pedido: las alertas miden días sin cambio.
  update pedidos set fecha_actualizacion = now() where id = p_pedido_id;

  return recalcular_estado_pedido(p_pedido_id, p_usuario_id);
end;
$$;

-- ── 5. Cambiar el pedido COMPLETO: también mueve sus prendas ─────────────────
-- Avanzar sube solo las prendas que van atrás (una que ya llegó más lejos no
-- retrocede); retroceder, entregar o cancelar deja todas en el estado nuevo.
create or replace function public.cambiar_estado_pedido(p_pedido_id uuid, p_nuevo_estado text, p_usuario_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_estado_actual text;
  v_factura_id    uuid;
  v_tipo          text;
begin
  select estado, factura_id, tipo
    into v_estado_actual, v_factura_id, v_tipo
  from pedidos
  where id = p_pedido_id
  for update;

  if not found then
    raise exception 'Pedido no encontrado: %', p_pedido_id;
  end if;

  -- 'cancelado' es terminal; 'entregado' se puede revertir (corrección de errores).
  if v_estado_actual = 'cancelado' then
    raise exception 'El pedido está cancelado, no se puede cambiar';
  end if;

  if p_nuevo_estado not in ('pendiente', 'comprado', 'usa', 'bucaramanga', 'santa_rosa', 'entregado', 'cancelado') then
    raise exception 'Estado inválido: %', p_nuevo_estado;
  end if;

  if p_nuevo_estado = v_estado_actual then
    raise exception 'El pedido ya está en estado "%"', v_estado_actual;
  end if;

  -- Regla: no se puede entregar sin factura (salvo venta inmediata).
  if p_nuevo_estado = 'entregado'
     and v_factura_id is null
     and v_tipo <> 'venta_inmediata' then
    raise exception 'Debes facturar el pedido antes de entregarlo';
  end if;

  update pedidos
  set estado = p_nuevo_estado
  where id = p_pedido_id;

  if p_nuevo_estado in ('entregado', 'cancelado')
     or orden_estado_pedido(p_nuevo_estado) < orden_estado_pedido(v_estado_actual) then
    update pedido_items set estado = p_nuevo_estado
    where pedido_id = p_pedido_id and estado <> p_nuevo_estado;
  else
    update pedido_items set estado = p_nuevo_estado
    where pedido_id = p_pedido_id
      and orden_estado_pedido(estado) < orden_estado_pedido(p_nuevo_estado);
  end if;

  -- Al cancelar, anular los abonos del pedido (se conservan para auditoría)
  if p_nuevo_estado = 'cancelado' then
    update pagos set anulado = true where pedido_id = p_pedido_id;
  end if;

  insert into historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id)
  values ('pedidos', p_pedido_id, 'estado', v_estado_actual, p_nuevo_estado, p_usuario_id);
end;
$$;

-- ── 6. Confirmar la compra de una prenda: solo ESA pasa a comprado ────────────
-- p_indice es la posición de la prenda en el pedido (1 = primera, orden por id,
-- igual que compra_items.pedido_item_indice). Con una sola prenda, pasa esa.
-- Con varias y sin índice no se sabe cuál es: no se mueve ninguna (antes
-- pasaba el pedido completo aunque lo demás no se hubiera comprado).
create or replace function public.marcar_prenda_comprada(p_pedido_id uuid, p_indice int, p_usuario_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item uuid;
  v_n    int;
begin
  select count(*) into v_n from pedido_items where pedido_id = p_pedido_id;
  if v_n <= 1 then
    update pedido_items set estado = 'comprado' where pedido_id = p_pedido_id and estado = 'pendiente';
  elsif p_indice is not null and p_indice >= 1 then
    select id into v_item from pedido_items
    where pedido_id = p_pedido_id
    order by id
    offset p_indice - 1
    limit 1;
    if v_item is not null then
      update pedido_items set estado = 'comprado' where id = v_item and estado = 'pendiente';
    end if;
  end if;

  update pedidos set fecha_actualizacion = now() where id = p_pedido_id and estado <> 'cancelado';
  perform recalcular_estado_pedido(p_pedido_id, p_usuario_id);
end;
$$;

-- ── 7. Editar pedido: las prendas conservan su estado ────────────────────────
-- (editar reemplaza las prendas; cada una nueva hereda el estado de la vieja
-- con el mismo artículo y talla, o el del pedido si es nueva.)
create or replace function public.editar_pedido(
  p_pedido_id uuid,
  p_numero_orden text,
  p_notas text,
  p_tipo_entrega text,
  p_direccion_entrega text,
  p_total integer,
  p_usuario_id uuid,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old_numero_orden      text;
  v_old_notas             text;
  v_old_tipo_entrega      text;
  v_old_direccion_entrega text;
  v_estado_pedido         text;
  v_old_items             jsonb;
begin
  select numero_orden, notas, tipo_entrega, direccion_entrega, estado
  into v_old_numero_orden, v_old_notas, v_old_tipo_entrega, v_old_direccion_entrega, v_estado_pedido
  from pedidos
  where id = p_pedido_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'articulo_id', articulo_id,
           'talla', upper(coalesce(talla, '')),
           'estado', estado) order by id), '[]'::jsonb)
  into v_old_items
  from pedido_items
  where pedido_id = p_pedido_id;

  update pedidos set
    numero_orden      = p_numero_orden,
    notas             = p_notas,
    tipo_entrega      = p_tipo_entrega,
    direccion_entrega = p_direccion_entrega,
    total             = p_total
  where id = p_pedido_id;

  delete from pedido_items where pedido_id = p_pedido_id;

  insert into pedido_items (pedido_id, articulo_id, marca, descripcion, talla, cantidad, precio_venta, imagen_url, estado)
  select
    p_pedido_id,
    nullif(item->>'articulo_id', '')::uuid,
    item->>'marca',
    item->>'descripcion',
    nullif(item->>'talla', ''),
    (item->>'cantidad')::integer,
    (item->>'precio_venta')::integer,
    nullif(item->>'imagen_url', ''),
    coalesce(
      (select o->>'estado'
       from jsonb_array_elements(v_old_items) o
       where (o->>'articulo_id') is not distinct from nullif(item->>'articulo_id', '')
         and o->>'talla' = upper(coalesce(nullif(item->>'talla', ''), ''))
       limit 1),
      v_estado_pedido)
  from jsonb_array_elements(p_items) as item;

  perform recalcular_estado_pedido(p_pedido_id, p_usuario_id);

  if v_old_numero_orden is distinct from p_numero_orden then
    insert into historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id)
    values ('pedidos', p_pedido_id, 'numero_orden', v_old_numero_orden, p_numero_orden, p_usuario_id);
  end if;

  if v_old_notas is distinct from p_notas then
    insert into historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id)
    values ('pedidos', p_pedido_id, 'notas', v_old_notas, p_notas, p_usuario_id);
  end if;

  if v_old_tipo_entrega is distinct from p_tipo_entrega then
    insert into historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id)
    values ('pedidos', p_pedido_id, 'tipo_entrega', v_old_tipo_entrega, p_tipo_entrega, p_usuario_id);
  end if;

  if v_old_direccion_entrega is distinct from p_direccion_entrega then
    insert into historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id)
    values ('pedidos', p_pedido_id, 'direccion_entrega', v_old_direccion_entrega, p_direccion_entrega, p_usuario_id);
  end if;
end;
$$;

-- ── 8. Envíos a Santa Rosa (cron): la prenda del renglón, o el pedido ────────
create or replace function public.marcar_envios_santa_rosa_auto()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_marcados integer := 0;
  r record;
begin
  for r in
    select distinct ei.pedido_id, ei.pedido_item_id, e.creado_por
    from envios e
    join sedes sd on sd.id = e.destino_sede_id and sd.codigo = 'SR'
    join envio_items ei on ei.envio_id = e.id and ei.pedido_id is not null
    join pedidos p on p.id = ei.pedido_id
    where e.creado_en <= now() - interval '18 hours'
      and e.creado_en >= now() - interval '14 days'
      and p.estado in ('pendiente', 'comprado', 'usa', 'bucaramanga')
  loop
    begin
      if r.pedido_item_id is not null then
        if exists (
          select 1 from pedido_items
          where id = r.pedido_item_id and pedido_id = r.pedido_id
            and estado in ('pendiente', 'comprado', 'usa', 'bucaramanga')
        ) then
          perform cambiar_estado_prendas(r.pedido_id, array[r.pedido_item_id], 'santa_rosa', r.creado_por);
          v_marcados := v_marcados + 1;
        end if;
      else
        perform cambiar_estado_pedido(r.pedido_id, 'santa_rosa', r.creado_por);
        v_marcados := v_marcados + 1;
      end if;
    exception when others then
      -- un pedido con problema no frena a los demás
      null;
    end;
  end loop;
  return v_marcados;
end
$$;

-- ── 9. Parches puntuales en funciones largas (reemplazo exacto verificado) ───
do $$
declare
  d  text;
  d0 text;
begin
  -- separar_pedido_por_articulos: cada parte nace con el estado de SU prenda.
  d := pg_get_functiondef('public.separar_pedido_por_articulos(uuid)'::regprocedure);
  d0 := d;
  d := replace(d,
    E'            fecha_actualizacion = now()
        where id = p_pedido_id;',
    E'            fecha_actualizacion = now(),
            estado = coalesce(r.estado, v_pedido.estado)
        where id = p_pedido_id;');
  if d = d0 then raise exception 'separar_pedido_por_articulos cambió: no se pudo parchear la parte 1'; end if;
  d0 := d;
  d := replace(d,
    'v_pedido.notas, v_pedido.estado, v_pedido.tipo, v_pedido.fecha_creacion)',
    'v_pedido.notas, coalesce(r.estado, v_pedido.estado), v_pedido.tipo, v_pedido.fecha_creacion)');
  if d = d0 then raise exception 'separar_pedido_por_articulos cambió: no se pudo parchear las partes nuevas'; end if;
  execute d;

  -- asignar_parcial_compra_item: la compra parcial marca comprada SOLO su prenda.
  d := pg_get_functiondef('public.asignar_parcial_compra_item(uuid, integer, text, uuid, smallint, uuid)'::regprocedure);
  d0 := d;
  d := replace(d,
    E'    update pedidos
    set estado = ''comprado'', fecha_actualizacion = now()
    where id = p_pedido_id and estado = ''pendiente'';',
    E'    perform marcar_prenda_comprada(p_pedido_id, p_pedido_item_indice, p_usuario_id);');
  if d = d0 then raise exception 'asignar_parcial_compra_item cambió: no se pudo parchear'; end if;
  execute d;
end;
$$;

-- ── 10. Permisos: las funciones nuevas no quedan abiertas al rol anónimo ─────
revoke execute on function public.recalcular_estado_pedido(uuid, uuid) from public, anon;
revoke execute on function public.cambiar_estado_prendas(uuid, uuid[], text, uuid) from public, anon;
revoke execute on function public.marcar_prenda_comprada(uuid, int, uuid) from public, anon;
grant execute on function public.recalcular_estado_pedido(uuid, uuid) to authenticated, service_role;
grant execute on function public.cambiar_estado_prendas(uuid, uuid[], text, uuid) to authenticated, service_role;
grant execute on function public.marcar_prenda_comprada(uuid, int, uuid) to authenticated, service_role;
