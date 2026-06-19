-- Migration 025: simplificar estados de pedido
-- De 8 estados → 6: pendiente, comprado, usa, bucaramanga, entregado, cancelado
-- Los estados avisado y en_sede se fusionan en bucaramanga.
-- llego_usa se renombra a usa. bodega_colombia se renombra a bucaramanga.

-- 1. Borrar constraint viejo ANTES de migrar datos
alter table pedidos drop constraint if exists pedidos_estado_check;

-- 2. Migrar datos existentes
update pedidos set estado = 'usa'         where estado = 'llego_usa';
update pedidos set estado = 'bucaramanga' where estado in ('bodega_colombia', 'avisado', 'en_sede');

update historial_cambios set valor_anterior = 'usa'
  where campo = 'estado' and valor_anterior = 'llego_usa';
update historial_cambios set valor_nuevo = 'usa'
  where campo = 'estado' and valor_nuevo = 'llego_usa';
update historial_cambios set valor_anterior = 'bucaramanga'
  where campo = 'estado' and valor_anterior in ('bodega_colombia', 'avisado', 'en_sede');
update historial_cambios set valor_nuevo = 'bucaramanga'
  where campo = 'estado' and valor_nuevo in ('bodega_colombia', 'avisado', 'en_sede');

-- 3. Agregar constraint nuevo
alter table pedidos add constraint pedidos_estado_check
  check (estado in ('pendiente', 'comprado', 'usa', 'bucaramanga', 'santa_rosa', 'entregado', 'cancelado'));

-- 4. Recrear función cambiar_estado_pedido con nuevos estados
create or replace function cambiar_estado_pedido(
  p_pedido_id  uuid,
  p_nuevo_estado text,
  p_usuario_id uuid
)
returns void
language plpgsql
security definer
as $$
declare
  v_estado_actual text;
begin
  select estado into v_estado_actual
  from pedidos
  where id = p_pedido_id
  for update;

  if not found then
    raise exception 'Pedido no encontrado: %', p_pedido_id;
  end if;

  if v_estado_actual in ('entregado', 'cancelado') then
    raise exception 'El pedido está en estado "%", no se puede cambiar', v_estado_actual;
  end if;

  if p_nuevo_estado not in ('pendiente', 'comprado', 'usa', 'bucaramanga', 'santa_rosa', 'entregado', 'cancelado') then
    raise exception 'Estado inválido: %', p_nuevo_estado;
  end if;

  if p_nuevo_estado = v_estado_actual then
    raise exception 'El pedido ya está en estado "%"', v_estado_actual;
  end if;

  update pedidos
  set estado = p_nuevo_estado
  where id = p_pedido_id;

  insert into historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id)
  values ('pedidos', p_pedido_id, 'estado', v_estado_actual, p_nuevo_estado, p_usuario_id);
end;
$$;

-- 5. Recrear vista con nuevos estados y umbrales de alerta
drop view if exists vista_zombies cascade;
drop view if exists vista_pedidos_asesor cascade;

create view vista_pedidos_asesor as
  select
    p.id,
    p.numero_orden,
    p.estado,
    p.total,
    p.tipo_entrega,
    p.direccion_entrega,
    p.notas,
    p.fecha_creacion,
    p.fecha_actualizacion,
    s.codigo  as sede_codigo,
    s.nombre  as sede_nombre,
    c.nombre  as cliente_nombre,
    c.telefono_normalizado as cliente_telefono,
    u.nombre  as asesor_nombre,
    p.asesor_id,
    p.sede_id,
    p.cliente_id,
    coalesce(
      (select sum(pg.monto) from pagos pg where pg.pedido_id = p.id),
      0
    ) as total_pagado,

    case
      when p.estado = 'pendiente'
        and p.fecha_actualizacion < now() - interval '2 days'    then true
      when p.estado = 'comprado'
        and p.fecha_actualizacion < now() - interval '8 days'    then true
      when p.estado in ('pendiente', 'comprado', 'usa')
        and p.fecha_creacion < now() - interval '15 days'        then true
      when p.estado = 'usa'
        and p.fecha_actualizacion < now() - interval '6 days'    then true
      when p.estado in ('bucaramanga', 'santa_rosa')
        and p.fecha_actualizacion < now() - interval '1 day'     then true
      else false
    end as en_alerta,

    (
      p.estado = 'pendiente'
      and p.fecha_creacion < now() - interval '30 days'
    ) as es_zombie,

    p.numero_guia

  from pedidos p
  join sedes    s on s.id = p.sede_id
  join clientes c on c.id = p.cliente_id
  join usuarios u on u.id = p.asesor_id;

create view vista_zombies as
  select * from vista_pedidos_asesor
  where es_zombie = true;
