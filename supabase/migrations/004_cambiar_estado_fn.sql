-- Migration 004: función para cambiar estado de pedido
-- Valida la transición, actualiza el estado y escribe historial atomicamente.
-- Las transiciones válidas deben mantenerse en sync con lib/domain/estados.ts

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
  v_transicion_valida boolean;
begin
  -- Obtener estado actual con lock para evitar condiciones de carrera
  select estado into v_estado_actual
  from pedidos
  where id = p_pedido_id
  for update;

  if not found then
    raise exception 'Pedido no encontrado: %', p_pedido_id;
  end if;

  -- Validar que el estado actual no sea terminal
  if v_estado_actual in ('entregado', 'cancelado') then
    raise exception 'El pedido está en estado "%", no se puede cambiar', v_estado_actual;
  end if;

  -- Validar transición permitida (espeja lib/domain/estados.ts)
  v_transicion_valida := case v_estado_actual
    when 'pendiente'       then p_nuevo_estado in ('comprado', 'cancelado')
    when 'comprado'        then p_nuevo_estado in ('llego_usa', 'cancelado')
    when 'llego_usa'       then p_nuevo_estado in ('bodega_colombia', 'cancelado')
    when 'bodega_colombia' then p_nuevo_estado in ('en_sede', 'cancelado')
    when 'en_sede'         then p_nuevo_estado in ('entregado', 'cancelado')
    else false
  end;

  if not v_transicion_valida then
    raise exception 'Transición inválida: % → %', v_estado_actual, p_nuevo_estado;
  end if;

  -- Actualizar estado (el trigger actualiza fecha_actualizacion automáticamente)
  update pedidos
  set estado = p_nuevo_estado
  where id = p_pedido_id;

  -- Registrar en historial
  insert into historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id)
  values ('pedidos', p_pedido_id, 'estado', v_estado_actual, p_nuevo_estado, p_usuario_id);
end;
$$;
