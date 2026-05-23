-- Migration 006: nuevo estado 'avisado'
-- Flujo actualizado:
--   pendiente → comprado → llego_usa → bodega_colombia → avisado → en_sede → entregado
--   (cancelado accesible desde cualquier estado no terminal)
--
-- 'avisado': el pedido llegó a bodega Colombia y se notificó al cliente.

-- ── 1. Actualizar CHECK constraint en pedidos ────────────────────────────────
alter table pedidos drop constraint if exists pedidos_estado_check;
alter table pedidos
  add constraint pedidos_estado_check
  check (estado in (
    'pendiente','comprado','llego_usa','bodega_colombia',
    'avisado','en_sede','entregado','cancelado'
  ));

-- ── 2. Recrear función cambiar_estado_pedido con nuevas transiciones ─────────
-- Espeja lib/domain/estados.ts — mantenerlos en sync.
create or replace function cambiar_estado_pedido(
  p_pedido_id    uuid,
  p_nuevo_estado text,
  p_usuario_id   uuid
)
returns void
language plpgsql
security definer
as $$
declare
  v_estado_actual    text;
  v_transicion_valida boolean;
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

  v_transicion_valida := case v_estado_actual
    when 'pendiente'       then p_nuevo_estado in ('comprado',      'cancelado')
    when 'comprado'        then p_nuevo_estado in ('llego_usa',     'cancelado')
    when 'llego_usa'       then p_nuevo_estado in ('bodega_colombia','cancelado')
    when 'bodega_colombia' then p_nuevo_estado in ('avisado',       'cancelado')
    when 'avisado'         then p_nuevo_estado in ('en_sede',       'cancelado')
    when 'en_sede'         then p_nuevo_estado in ('entregado',     'cancelado')
    else false
  end;

  if not v_transicion_valida then
    raise exception 'Transición inválida: % → %', v_estado_actual, p_nuevo_estado;
  end if;

  update pedidos
  set estado = p_nuevo_estado
  where id = p_pedido_id;

  insert into historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id)
  values ('pedidos', p_pedido_id, 'estado', v_estado_actual, p_nuevo_estado, p_usuario_id);
end;
$$;

-- ── 3. Recrear vista con umbral de alerta para 'avisado' (3 días) ───────────
create or replace view vista_pedidos_asesor as
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
        and p.fecha_actualizacion < now() - interval '3 days'   then true
      when p.estado = 'comprado'
        and p.fecha_actualizacion < now() - interval '7 days'   then true
      when p.estado = 'llego_usa'
        and p.fecha_actualizacion < now() - interval '15 days'  then true
      when p.estado = 'bodega_colombia'
        and p.fecha_actualizacion < now() - interval '5 days'   then true
      when p.estado = 'avisado'
        and p.fecha_actualizacion < now() - interval '3 days'   then true
      when p.estado = 'en_sede'
        and p.fecha_actualizacion < now() - interval '2 days'   then true
      else false
    end as en_alerta,

    (
      p.estado = 'pendiente'
      and p.fecha_creacion < now() - interval '30 days'
    ) as es_zombie

  from pedidos p
  join sedes    s on s.id = p.sede_id
  join clientes c on c.id = p.cliente_id
  join usuarios u on u.id = p.asesor_id;

create or replace view vista_zombies as
  select * from vista_pedidos_asesor
  where es_zombie = true;
