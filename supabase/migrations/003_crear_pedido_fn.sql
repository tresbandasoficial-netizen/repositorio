-- Migration 003: función transaccional para crear pedido
-- Se llama desde el Server Action vía supabase.rpc('crear_pedido', {...})
-- Garantiza atomicidad: o todo se crea o nada.

create or replace function crear_pedido(
  p_numero_orden      text,
  p_sede_id           uuid,
  p_asesor_id         uuid,
  p_cliente_id        uuid,
  p_total             integer,
  p_tipo_entrega      text,
  p_direccion_entrega text,
  p_notas             text,
  p_items             jsonb,  -- [{marca, descripcion, talla, cantidad, precio_venta}]
  p_abono             integer,
  p_metodo_pago       text
)
returns uuid  -- id del pedido creado
language plpgsql
security definer
as $$
declare
  v_pedido_id uuid;
  v_item      jsonb;
begin
  -- Insertar pedido
  insert into pedidos (
    numero_orden, sede_id, asesor_id, cliente_id,
    total, tipo_entrega, direccion_entrega, notas
  )
  values (
    p_numero_orden, p_sede_id, p_asesor_id, p_cliente_id,
    p_total, p_tipo_entrega, p_direccion_entrega, p_notas
  )
  returning id into v_pedido_id;

  -- Insertar items
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into pedido_items (pedido_id, marca, descripcion, talla, cantidad, precio_venta)
    values (
      v_pedido_id,
      v_item->>'marca',
      v_item->>'descripcion',
      nullif(v_item->>'talla', ''),
      (v_item->>'cantidad')::integer,
      (v_item->>'precio_venta')::integer
    );
  end loop;

  -- Insertar pago inicial si hay abono
  if p_abono > 0 then
    insert into pagos (pedido_id, monto, metodo, asesor_id)
    values (v_pedido_id, p_abono, p_metodo_pago, p_asesor_id);
  end if;

  -- Registrar en historial
  insert into historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id)
  values ('pedidos', v_pedido_id, 'estado', null, 'pendiente', p_asesor_id);

  return v_pedido_id;
end;
$$;
