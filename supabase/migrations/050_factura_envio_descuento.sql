-- Migration 050: Envío y Descuento en facturas.
-- El total de la factura ahora es: subtotal + envío - descuento.
-- Se guardan como columnas en `facturas` y se exponen en vista_facturas.

alter table facturas
  add column if not exists envio     integer not null default 0,
  add column if not exists descuento integer not null default 0;

-- ── Vistas: recrear para exponer envio/descuento ──
-- vista_morosos depende de vista_facturas (select *), por eso se eliminan ambas.
drop view if exists vista_morosos;
drop view if exists vista_facturas;

create view vista_facturas as
select
  f.id,
  f.numero_factura,
  f.cliente_id,
  c.nombre               as cliente_nombre,
  c.telefono_normalizado as cliente_telefono,
  f.sede_id,
  s.codigo               as sede_codigo,
  s.nombre               as sede_nombre,
  f.asesor_id,
  u.nombre               as asesor_nombre,
  f.fecha_factura,
  f.fecha_vencimiento,
  f.total,
  f.envio,
  f.descuento,
  (f.total - f.envio + f.descuento)::integer        as subtotal,
  coalesce(pg.total_abonado, 0)::integer            as total_abonado,
  (f.total - coalesce(pg.total_abonado, 0))::integer as saldo,
  case
    when f.estado in ('pagada', 'anulada') then 0
    when f.fecha_vencimiento < current_date
      then (current_date - f.fecha_vencimiento)
    else 0
  end as dias_atraso,
  f.estado,
  f.notas,
  f.creado_en
from facturas f
join clientes c on c.id = f.cliente_id
join sedes    s on s.id = f.sede_id
join usuarios u on u.id = f.asesor_id
left join (
  select factura_id, sum(monto) as total_abonado
  from pagos_factura
  group by factura_id
) pg on pg.factura_id = f.id;

create view vista_morosos as
select *
from vista_facturas
where saldo > 0
  and estado not in ('pagada', 'anulada')
  and fecha_vencimiento < current_date;

-- ── RPCs: aceptar p_envio / p_descuento ──
-- Firmas anteriores (migración 049): se eliminan para recrearlas con los nuevos parámetros.
drop function if exists crear_factura_venta_local(uuid, uuid, uuid, date, jsonb, integer, uuid, text);
drop function if exists crear_factura(uuid, uuid, uuid, date, uuid[], text, integer, uuid);

-- Venta del local (sin pedidos previos)
create or replace function crear_factura_venta_local(
  p_cliente_id uuid,
  p_sede_id uuid,
  p_asesor_id uuid,
  p_fecha_vencimiento date,
  p_productos jsonb,
  p_abono_inicial integer default 0,
  p_cuenta_id uuid default null,
  p_envio integer default 0,
  p_descuento integer default 0,
  p_notas text default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_factura_id uuid;
  v_numero     text;
  v_numero_orden text;
  v_subtotal   integer;
  v_total      integer;
  v_producto   jsonb;
  v_pedido_id  uuid;
  v_articulo   uuid;
  v_marca      text;
  v_nombre     text;
  v_color      text;
  v_sexo       text;
  v_categoria  text;
  v_codigo     text;
begin
  v_subtotal := 0;
  for v_producto in select * from jsonb_array_elements(p_productos)
  loop
    v_subtotal := v_subtotal + ((v_producto->>'precio_venta')::integer * (v_producto->>'cantidad')::integer);
  end loop;

  v_total := v_subtotal + coalesce(p_envio, 0) - coalesce(p_descuento, 0);
  if v_total < 0 then v_total := 0; end if;

  v_numero       := siguiente_numero_factura(p_sede_id);
  v_numero_orden := 'VL-' || v_numero;

  insert into facturas (numero_factura, cliente_id, sede_id, asesor_id, fecha_vencimiento, total, envio, descuento, estado, notas)
  values (v_numero, p_cliente_id, p_sede_id, p_asesor_id, p_fecha_vencimiento, v_total, coalesce(p_envio, 0), coalesce(p_descuento, 0), 'pendiente', p_notas)
  returning id into v_factura_id;

  -- El pedido (interno) refleja el total final para que la cartera quede consistente.
  insert into pedidos (numero_orden, sede_id, asesor_id, cliente_id, total, tipo_entrega, estado, tipo, factura_id)
  values (v_numero_orden, p_sede_id, p_asesor_id, p_cliente_id, v_total, 'sede', 'entregado', 'venta_inmediata', v_factura_id)
  returning id into v_pedido_id;

  for v_producto in select * from jsonb_array_elements(p_productos)
  loop
    v_articulo  := nullif(v_producto->>'articulo_id', '')::uuid;
    v_marca     := v_producto->>'marca';
    v_nombre    := v_producto->>'descripcion';
    v_color     := nullif(v_producto->>'color', '');
    v_sexo      := nullif(v_producto->>'sexo', '');
    v_categoria := nullif(v_producto->>'categoria', '');
    v_codigo    := nullif(v_producto->>'codigo', '');

    if v_articulo is null and v_marca is not null and v_nombre is not null then
      insert into articulos (nombre, marca, codigo, color, sexo, categoria, activo)
      values (v_nombre, v_marca, v_codigo, v_color, v_sexo, v_categoria, true)
      on conflict (lower(marca), lower(nombre), lower(coalesce(color, '')), lower(coalesce(sexo, '')))
      do update set
        categoria = coalesce(excluded.categoria, articulos.categoria),
        color     = coalesce(excluded.color, articulos.color),
        codigo    = coalesce(articulos.codigo, excluded.codigo)
      returning id into v_articulo;
    end if;

    if v_articulo is not null and v_codigo is not null then
      update articulos set codigo = v_codigo
      where id = v_articulo and codigo is null;
    end if;

    insert into pedido_items (
      pedido_id, articulo_id, marca, descripcion, talla, cantidad,
      precio_venta, color, sexo, categoria, codigo
    )
    values (
      v_pedido_id, v_articulo, v_marca, v_nombre,
      nullif(v_producto->>'talla', ''),
      (v_producto->>'cantidad')::integer,
      (v_producto->>'precio_venta')::integer,
      v_color, v_sexo, v_categoria, v_codigo
    );
  end loop;

  if p_abono_inicial > 0 then
    insert into pagos (pedido_id, monto, metodo, cuenta_id, asesor_id)
    values (v_pedido_id, p_abono_inicial, 'cuenta', p_cuenta_id, p_asesor_id);
  end if;

  insert into historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id)
  values ('facturas', v_factura_id, 'estado', null, 'pendiente', p_asesor_id);

  return v_factura_id;
end;
$$;

-- Factura sobre pedidos existentes
create or replace function crear_factura(
  p_cliente_id       uuid,
  p_sede_id          uuid,
  p_asesor_id        uuid,
  p_fecha_vencimiento date,
  p_pedido_ids       uuid[],
  p_notas            text default null,
  p_abono_inicial    integer default 0,
  p_cuenta_id        uuid default null,
  p_envio            integer default 0,
  p_descuento        integer default 0
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_factura_id uuid;
  v_numero     text;
  v_bruto      integer;
  v_prepagado  integer;
  v_subtotal   integer;
  v_total      integer;
  v_count      integer;
begin
  if array_length(p_pedido_ids, 1) is null then
    raise exception 'Debe incluir al menos un pedido';
  end if;

  select count(*) into v_count
  from pedidos
  where id = any(p_pedido_ids)
    and cliente_id = p_cliente_id
    and sede_id = p_sede_id
    and estado <> 'cancelado'
    and factura_id is null;

  if v_count <> array_length(p_pedido_ids, 1) then
    raise exception 'Algun pedido no es valido: no debe estar cancelado ni facturado y debe ser del mismo cliente y sede';
  end if;

  select coalesce(sum(total), 0) into v_bruto from pedidos where id = any(p_pedido_ids);
  select coalesce(sum(pg.monto), 0) into v_prepagado from pagos pg where pg.pedido_id = any(p_pedido_ids);

  v_subtotal := v_bruto - v_prepagado;
  if v_subtotal < 0 then v_subtotal := 0; end if;

  v_total := v_subtotal + coalesce(p_envio, 0) - coalesce(p_descuento, 0);
  if v_total < 0 then v_total := 0; end if;

  v_numero := siguiente_numero_factura(p_sede_id);

  insert into facturas (numero_factura, cliente_id, sede_id, asesor_id, fecha_vencimiento, total, envio, descuento, notas)
  values (v_numero, p_cliente_id, p_sede_id, p_asesor_id, p_fecha_vencimiento, v_total, coalesce(p_envio, 0), coalesce(p_descuento, 0), p_notas)
  returning id into v_factura_id;

  update pedidos set factura_id = v_factura_id where id = any(p_pedido_ids);

  if p_abono_inicial > 0 then
    insert into pagos_factura (factura_id, monto, metodo, cuenta_id, asesor_id)
    values (v_factura_id, p_abono_inicial, 'cuenta', p_cuenta_id, p_asesor_id);
    if p_abono_inicial >= v_total then
      update facturas set estado = 'pagada', actualizado_en = now() where id = v_factura_id;
    end if;
  end if;

  return v_factura_id;
end;
$$;
