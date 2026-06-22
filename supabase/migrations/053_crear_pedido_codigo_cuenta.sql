-- Migration 053: crear_pedido guarda codigo en pedido_items y acepta cuenta destino
--
-- Alinea la creación de pedidos con el formato de facturación:
--  - cada ítem guarda su 'codigo' (la "cédula" del producto) en pedido_items
--  - el abono se puede registrar contra una cuenta destino (metodo='cuenta', cuenta_id)
--
-- El upsert del artículo en el catálogo lo hace la capa TypeScript (guardarArticulo),
-- que ya envía articulo_id resuelto; aquí solo persistimos codigo y el pago.

drop function if exists crear_pedido(text, uuid, uuid, uuid, integer, text, text, text, jsonb, integer, text);

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
      pedido_id, articulo_id, codigo, marca, descripcion, talla, cantidad, precio_venta, imagen_url
    )
    values (
      v_pedido_id,
      nullif(v_item->>'articulo_id', '')::uuid,
      nullif(v_item->>'codigo', ''),
      v_item->>'marca',
      v_item->>'descripcion',
      nullif(v_item->>'talla', ''),
      (v_item->>'cantidad')::integer,
      (v_item->>'precio_venta')::integer,
      nullif(v_item->>'imagen_url', '')
    );
  end loop;

  if p_abono > 0 then
    insert into pagos (pedido_id, monto, metodo, cuenta_id, asesor_id)
    values (v_pedido_id, p_abono, p_metodo_pago, p_cuenta_id, p_asesor_id);
  end if;

  insert into historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id)
  values ('pedidos', v_pedido_id, 'estado', null, 'pendiente', p_asesor_id);

  return v_pedido_id;
end;
$$;
