-- Migration 046: Auto-create articulo in catalog when creating pedido_items

-- Actualiza registrar_venta_inmediata para hacer upsert en articulos
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
  v_marca      text;
  v_nombre     text;
  v_color      text;
  v_sexo       text;
  v_categoria  text;
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
    v_articulo  := nullif(v_item->>'articulo_id', '')::uuid;
    v_cantidad  := (v_item->>'cantidad')::integer;
    v_talla     := nullif(v_item->>'talla', '');
    v_marca     := v_item->>'marca';
    v_nombre    := v_item->>'descripcion';
    v_color     := nullif(v_item->>'color', '');
    v_sexo      := nullif(v_item->>'sexo', '');
    v_categoria := nullif(v_item->>'categoria', '');

    -- Si no viene articulo_id pero hay marca+nombre, upsert en catálogo
    if v_articulo is null and v_marca is not null and v_nombre is not null then
      insert into articulos (nombre, marca, color, sexo, categoria, activo)
      values (v_nombre, v_marca, v_color, v_sexo, v_categoria, true)
      on conflict (lower(marca), lower(nombre), lower(coalesce(color, '')), lower(coalesce(sexo, '')))
      do update set
        categoria = coalesce(excluded.categoria, articulos.categoria),
        color     = coalesce(excluded.color, articulos.color)
      returning id into v_articulo;
    end if;

    insert into pedido_items (pedido_id, articulo_id, marca, descripcion, talla, cantidad, precio_venta, color, sexo, categoria)
    values (
      v_pedido_id, v_articulo, v_marca, v_nombre, v_talla,
      v_cantidad, (v_item->>'precio_venta')::integer,
      v_color, v_sexo, v_categoria
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

-- Actualiza crear_factura_venta_local para hacer upsert en articulos
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
  v_numero     text;
  v_numero_orden text;
  v_total      integer;
  v_producto   jsonb;
  v_pedido_id  uuid;
  v_articulo   uuid;
  v_marca      text;
  v_nombre     text;
  v_color      text;
  v_sexo       text;
  v_categoria  text;
begin
  v_total := 0;
  for v_producto in select * from jsonb_array_elements(p_productos)
  loop
    v_total := v_total + ((v_producto->>'precio_venta')::integer * (v_producto->>'cantidad')::integer);
  end loop;

  v_numero       := siguiente_numero_factura(p_sede_id);
  v_numero_orden := 'VL-' || v_numero;

  insert into facturas (numero_factura, cliente_id, sede_id, asesor_id, fecha_vencimiento, total, estado, notas)
  values (v_numero, p_cliente_id, p_sede_id, p_asesor_id, p_fecha_vencimiento, v_total, 'pendiente', p_notas)
  returning id into v_factura_id;

  insert into pedidos (numero_orden, sede_id, asesor_id, cliente_id, total, tipo_entrega, estado, tipo, factura_id)
  values (v_numero_orden, p_sede_id, p_asesor_id, p_cliente_id, v_total, 'sede', 'entregado', 'venta_inmediata', v_factura_id)
  returning id into v_pedido_id;

  for v_producto in select * from jsonb_array_elements(p_productos)
  loop
    v_articulo  := nullif(v_producto->>'articulo_id', '')::uuid;
    v_marca     := v_producto->>'marca';
    v_nombre    := v_producto->>'descripcion';
    v_color     := nullif(v_producto->>'color', '');
    v_sexo      := nullif(v_producto->>'sexo', '');
    v_categoria := nullif(v_producto->>'categoria', '');

    -- Si no viene articulo_id pero hay marca+nombre, upsert en catálogo
    if v_articulo is null and v_marca is not null and v_nombre is not null then
      insert into articulos (nombre, marca, color, sexo, categoria, activo)
      values (v_nombre, v_marca, v_color, v_sexo, v_categoria, true)
      on conflict (lower(marca), lower(nombre), lower(coalesce(color, '')), lower(coalesce(sexo, '')))
      do update set
        categoria = coalesce(excluded.categoria, articulos.categoria),
        color     = coalesce(excluded.color, articulos.color)
      returning id into v_articulo;
    end if;

    insert into pedido_items (
      pedido_id, articulo_id, marca, descripcion, talla, cantidad, precio_venta, color, sexo, categoria
    )
    values (
      v_pedido_id, v_articulo, v_marca, v_nombre,
      nullif(v_producto->>'talla', ''),
      (v_producto->>'cantidad')::integer,
      (v_producto->>'precio_venta')::integer,
      v_color, v_sexo, v_categoria
    );
  end loop;

  if p_abono_inicial > 0 then
    insert into pagos (pedido_id, monto, metodo, asesor_id)
    values (v_pedido_id, p_abono_inicial, p_metodo_abono, p_asesor_id);
  end if;

  insert into historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id)
  values ('facturas', v_factura_id, 'estado', null, 'pendiente', p_asesor_id);

  return v_factura_id;
end;
$$;
