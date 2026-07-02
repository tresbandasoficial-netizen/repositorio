-- Migration 043: Update registrar_venta_inmediata to accept cuenta_id

create or replace function registrar_venta_inmediata(
  p_numero_orden text,
  p_sede_id      uuid,
  p_asesor_id    uuid,
  p_cliente_id   uuid,
  p_total        integer,
  p_items        jsonb,
  p_abono        integer,
  p_cuenta_id    uuid default null,
  p_notas        text default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_pedido_id  uuid;
  v_item       jsonb;
  v_articulo   uuid;
  v_cantidad   integer;
  v_talla      text;
  v_costo      integer;
begin
  insert into pedidos (
    numero_orden, sede_id, asesor_id, cliente_id,
    total, tipo_entrega, direccion_entrega, notas, estado, tipo
  )
  values (
    p_numero_orden, p_sede_id, p_asesor_id, p_cliente_id,
    p_total, 'sede', null, p_notas, 'entregado', 'venta_inmediata'
  )
  returning id into v_pedido_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_articulo := nullif(v_item->>'articulo_id', '')::uuid;
    v_cantidad := (v_item->>'cantidad')::integer;
    v_talla    := nullif(v_item->>'talla', '');

    insert into pedido_items (pedido_id, articulo_id, marca, descripcion, talla, cantidad, precio_venta)
    values (
      v_pedido_id,
      v_articulo,
      v_item->>'marca',
      v_item->>'descripcion',
      v_talla,
      v_cantidad,
      (v_item->>'precio_venta')::integer
    );

    if v_articulo is not null then
      select costo_promedio into v_costo
      from vista_costo_promedio
      where articulo_id = v_articulo and (talla is not distinct from v_talla);

      insert into movimientos_inventario (
        articulo_id, talla, sede_id, delta, tipo, pedido_id, costo_unitario_cop, usuario_id
      )
      values (
        v_articulo, v_talla, p_sede_id, -v_cantidad, 'salida', v_pedido_id, v_costo, p_asesor_id
      );
    end if;
  end loop;

  if p_abono > 0 then
    insert into pagos (pedido_id, monto, metodo, cuenta_id, asesor_id)
    values (v_pedido_id, p_abono, 'cuenta', p_cuenta_id, p_asesor_id);
  end if;

  insert into historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id)
  values ('pedidos', v_pedido_id, 'estado', null, 'entregado', p_asesor_id);

  return v_pedido_id;
end;
$$;
