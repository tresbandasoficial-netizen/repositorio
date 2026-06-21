-- Migration 030: no se puede entregar un pedido sin factura
--
-- Regla de negocio: todo se factura ANTES de entregar. Por eso al cambiar un
-- pedido a 'entregado' debe existir una factura asociada (factura_id no nulo).
-- Excepción: las ventas inmediatas (tipo = 'venta_inmediata') nacen ya entregadas
-- en un solo acto y no pasan por esta función.

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

  if v_estado_actual in ('entregado', 'cancelado') then
    raise exception 'El pedido está en estado "%", no se puede cambiar', v_estado_actual;
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

  insert into historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id)
  values ('pedidos', p_pedido_id, 'estado', v_estado_actual, p_nuevo_estado, p_usuario_id);
end;
$$;
