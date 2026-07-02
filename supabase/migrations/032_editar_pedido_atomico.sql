-- Migration 032: Función editar_pedido() atómica
--
-- Problema: editarPedidoAction hacía DELETE de items + INSERT en pasos
-- separados. Si el INSERT fallaba (error de red, dato inválido, timeout),
-- el pedido quedaba sin productos sin posibilidad de recuperación.
--
-- Solución: una función PL/pgSQL con security definer que ejecuta el
-- UPDATE del pedido + DELETE + INSERT de items dentro de una sola
-- transacción. Si algo falla, PostgreSQL hace rollback automático y
-- el pedido queda exactamente como estaba.

create or replace function editar_pedido(
  p_pedido_id         uuid,
  p_numero_orden      text,
  p_notas             text,
  p_tipo_entrega      text,
  p_direccion_entrega text,
  p_total             integer,
  p_usuario_id        uuid,
  p_items             jsonb
)
returns void
language plpgsql
security definer
as $$
declare
  v_old_numero_orden      text;
  v_old_notas             text;
  v_old_tipo_entrega      text;
  v_old_direccion_entrega text;
begin
  -- Capturar valores actuales para el historial
  select numero_orden, notas, tipo_entrega, direccion_entrega
  into v_old_numero_orden, v_old_notas, v_old_tipo_entrega, v_old_direccion_entrega
  from pedidos
  where id = p_pedido_id;

  -- Actualizar el pedido
  update pedidos set
    numero_orden      = p_numero_orden,
    notas             = p_notas,
    tipo_entrega      = p_tipo_entrega,
    direccion_entrega = p_direccion_entrega,
    total             = p_total
  where id = p_pedido_id;

  -- Reemplazar items de forma atómica (delete + insert en la misma transacción)
  delete from pedido_items where pedido_id = p_pedido_id;

  insert into pedido_items (pedido_id, articulo_id, marca, descripcion, talla, cantidad, precio_venta, imagen_url)
  select
    p_pedido_id,
    nullif(item->>'articulo_id', '')::uuid,
    item->>'marca',
    item->>'descripcion',
    nullif(item->>'talla', ''),
    (item->>'cantidad')::integer,
    (item->>'precio_venta')::integer,
    nullif(item->>'imagen_url', '')
  from jsonb_array_elements(p_items) as item;

  -- Registrar cambios en historial
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
