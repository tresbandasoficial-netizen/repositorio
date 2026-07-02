-- Migration 051: Add p_cuenta_id to crear_pedido so abonos save cuenta_id in pagos

create or replace function crear_pedido(
  p_numero_orden      text,
  p_sede_id           uuid,
  p_asesor_id         uuid,
  p_cliente_id        uuid,
  p_total             integer,
  p_tipo_entrega      text,
  p_direccion_entrega text,
  p_notas             text,
  p_items             jsonb,
  p_abono             integer,
  p_metodo_pago       text,
  p_cuenta_id         uuid default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_pedido_id uuid;
  v_item      jsonb;
begin
  insert into pedidos (
    numero_orden, sede_id, asesor_id, cliente_id,
    total, tipo_entrega, direccion_entrega, notas
  )
  values (
    p_numero_orden, p_sede_id, p_asesor_id, p_cliente_id,
    p_total, p_tipo_entrega, p_direccion_entrega, p_notas
  )
  returning id into v_pedido_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into pedido_items (
      pedido_id, articulo_id, marca, descripcion, talla,
      cantidad, precio_venta, imagen_url, color, sexo, categoria
    )
    values (
      v_pedido_id,
      nullif(v_item->>'articulo_id', '')::uuid,
      v_item->>'marca',
      v_item->>'descripcion',
      nullif(v_item->>'talla', ''),
      (v_item->>'cantidad')::integer,
      (v_item->>'precio_venta')::integer,
      nullif(v_item->>'imagen_url', ''),
      nullif(v_item->>'color', ''),
      nullif(v_item->>'sexo', ''),
      nullif(v_item->>'categoria', '')
    );
  end loop;

  if p_abono > 0 then
    insert into pagos (pedido_id, monto, metodo, asesor_id, cuenta_id)
    values (v_pedido_id, p_abono, p_metodo_pago, p_asesor_id, p_cuenta_id);
  end if;

  insert into historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id)
  values ('pedidos', v_pedido_id, 'estado', null, 'pendiente', p_asesor_id);

  return v_pedido_id;
end;
$$;
