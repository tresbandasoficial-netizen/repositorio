-- Migration 045: Create function for direct store sales (factura sin pedidos)

create or replace function crear_factura_venta_local(
  p_cliente_id uuid,
  p_sede_id uuid,
  p_asesor_id uuid,
  p_fecha_vencimiento date,
  p_productos jsonb,
  p_abono_inicial integer default 0,
  p_metodo_abono text default null,
  p_notas text default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_factura_id uuid;
  v_numero text;
  v_total integer;
  v_producto jsonb;
  v_pedido_id uuid;
begin
  -- Calcular total
  v_total := 0;
  for v_producto in select * from jsonb_array_elements(p_productos)
  loop
    v_total := v_total + ((v_producto->>'precio_venta')::integer * (v_producto->>'cantidad')::integer);
  end loop;

  -- Crear factura sin pedidos vinculados
  v_numero := siguiente_numero_factura(p_sede_id);

  insert into facturas (numero_factura, cliente_id, sede_id, asesor_id, fecha_vencimiento, total, estado, notas)
  values (v_numero, p_cliente_id, p_sede_id, p_asesor_id, p_fecha_vencimiento, v_total, 'pendiente', p_notas)
  returning id into v_factura_id;

  -- Crear un pedido "venta_inmediata" para agrupar los productos
  insert into pedidos (numero_orden, sede_id, asesor_id, cliente_id, total, tipo_entrega, estado, tipo, factura_id)
  values (null, p_sede_id, p_asesor_id, p_cliente_id, v_total, 'sede', 'entregado', 'venta_inmediata', v_factura_id)
  returning id into v_pedido_id;

  -- Insertar productos en el pedido
  for v_producto in select * from jsonb_array_elements(p_productos)
  loop
    insert into pedido_items (
      pedido_id, articulo_id, marca, descripcion, talla, cantidad, precio_venta, color, sexo, categoria
    )
    values (
      v_pedido_id,
      nullif(v_producto->>'articulo_id', '')::uuid,
      v_producto->>'marca',
      v_producto->>'descripcion',
      nullif(v_producto->>'talla', ''),
      (v_producto->>'cantidad')::integer,
      (v_producto->>'precio_venta')::integer,
      v_producto->>'color',
      v_producto->>'sexo',
      v_producto->>'categoria'
    );
  end loop;

  -- Registrar pago inicial si aplica
  if p_abono_inicial > 0 then
    insert into pagos (pedido_id, monto, metodo, asesor_id)
    values (v_pedido_id, p_abono_inicial, p_metodo_abono, p_asesor_id);
  end if;

  insert into historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id)
  values ('facturas', v_factura_id, 'estado', null, 'pendiente', p_asesor_id);

  return v_factura_id;
end;
$$;
