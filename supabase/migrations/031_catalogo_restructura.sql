-- Migration 031: Reestructura catálogo de productos
--
-- El catálogo (articulos) describe el MODELO; el inventario (movimientos_inventario)
-- registra el stock por TALLA y SEDE.
--
-- Un código de producto (articulos.codigo) representa un modelo único —por ejemplo
-- "VOMERO5-WB" para Nike Vomero 5 White/Black— independientemente de la talla.
-- La talla vive ahora en movimientos_inventario.talla, no en articulos.
--
-- Cambios:
--   articulos           : + codigo (único sparse), referencia, color, sexo, fotos[], descripcion
--   movimientos_inventario : + talla
--   Vistas y funciones  : actualizadas para agrupar por (articulo, talla)

-- ─── 1. Nuevos campos en el catálogo ─────────────────────────────────────────

alter table articulos
  add column if not exists codigo      text,
  add column if not exists referencia  text,
  add column if not exists color       text,
  add column if not exists sexo        text check (sexo in ('hombre', 'mujer', 'nino')),
  add column if not exists fotos       text[] not null default '{}',
  add column if not exists descripcion text;

-- Código único por producto (sparse: solo aplica si se especifica).
create unique index if not exists articulos_codigo_idx
  on articulos (lower(codigo)) where codigo is not null;

-- Índice de búsqueda por código para auto-complete.
create index if not exists idx_articulos_codigo_trgm
  on articulos using gin (codigo gin_trgm_ops) where codigo is not null;

-- Reemplazar el índice viejo (marca+nombre+talla) → nuevo (marca+nombre+color+sexo).
-- La talla ya no es parte del catálogo.
drop index if exists articulos_unico;
create unique index if not exists articulos_unico
  on articulos (
    lower(marca),
    lower(nombre),
    lower(coalesce(color, '')),
    lower(coalesce(sexo, ''))
  );

-- ─── 2. Talla en el inventario ────────────────────────────────────────────────

alter table movimientos_inventario
  add column if not exists talla text;

create index if not exists idx_mov_talla on movimientos_inventario (articulo_id, talla);

-- ─── 3. Recrear vistas ───────────────────────────────────────────────────────

drop view if exists vista_utilidad_facturas;
drop view if exists vista_utilidad_pedidos;
drop view if exists vista_stock_por_sede;
drop view if exists vista_costo_promedio;

-- CPP ahora se calcula por (articulo, talla).
create view vista_costo_promedio as
select
  m.articulo_id,
  m.talla,
  round(
    sum(m.delta * m.costo_unitario_cop)::numeric / nullif(sum(m.delta), 0)
  )::integer as costo_promedio
from movimientos_inventario m
where m.tipo = 'entrada' and m.costo_unitario_cop is not null
group by m.articulo_id, m.talla;

-- Stock por (articulo, talla, sede).
-- coalesce(m.talla, a.talla): compatibilidad con movimientos anteriores que
-- usaban articulos.talla como identificador de talla.
create view vista_stock_por_sede as
select
  m.articulo_id,
  a.nombre,
  a.marca,
  coalesce(m.talla, a.talla) as talla,
  a.categoria,
  m.sede_id,
  sum(m.delta)::integer as stock
from movimientos_inventario m
join articulos a on a.id = m.articulo_id
group by m.articulo_id, a.nombre, a.marca, coalesce(m.talla, a.talla), a.categoria, m.sede_id;

-- Utilidad por pedido (CPP cruza por talla).
create view vista_utilidad_pedidos as
select
  p.id          as pedido_id,
  p.numero_orden,
  p.tipo,
  p.sede_id,
  p.cliente_id,
  p.fecha_creacion,
  sum(pi.precio_venta * pi.cantidad)::integer as ingreso,
  sum(coalesce(cp.costo_promedio, 0) * pi.cantidad)::integer as costo,
  (sum(pi.precio_venta * pi.cantidad)
    - sum(coalesce(cp.costo_promedio, 0) * pi.cantidad))::integer as utilidad
from pedidos p
join pedido_items pi on pi.pedido_id = p.id
left join vista_costo_promedio cp
  on cp.articulo_id = pi.articulo_id
  and (cp.talla is not distinct from pi.talla)
where p.estado != 'cancelado'
group by p.id, p.numero_orden, p.tipo, p.sede_id, p.cliente_id, p.fecha_creacion;

create view vista_utilidad_facturas as
select
  f.id            as factura_id,
  f.numero_factura,
  f.sede_id,
  f.cliente_id,
  f.fecha_factura,
  sum(up.ingreso)::integer  as ingreso,
  sum(up.costo)::integer    as costo,
  sum(up.utilidad)::integer as utilidad
from facturas f
join pedidos p on p.factura_id = f.id
join vista_utilidad_pedidos up on up.pedido_id = p.id
where f.estado != 'anulada'
group by f.id, f.numero_factura, f.sede_id, f.cliente_id, f.fecha_factura;

-- ─── 4. Funciones actualizadas ────────────────────────────────────────────────

-- crear_pedido: ahora acepta articulo_id en cada ítem del JSON.
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
  p_metodo_pago       text
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
      pedido_id, articulo_id, marca, descripcion, talla, cantidad, precio_venta, imagen_url
    )
    values (
      v_pedido_id,
      nullif(v_item->>'articulo_id', '')::uuid,
      v_item->>'marca',
      v_item->>'descripcion',
      nullif(v_item->>'talla', ''),
      (v_item->>'cantidad')::integer,
      (v_item->>'precio_venta')::integer,
      nullif(v_item->>'imagen_url', '')
    );
  end loop;

  if p_abono > 0 then
    insert into pagos (pedido_id, monto, metodo, asesor_id)
    values (v_pedido_id, p_abono, p_metodo_pago, p_asesor_id);
  end if;

  insert into historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id)
  values ('pedidos', v_pedido_id, 'estado', null, 'pendiente', p_asesor_id);

  return v_pedido_id;
end;
$$;

-- registrar_entrada_inventario: + p_talla
create or replace function registrar_entrada_inventario(
  p_articulo_id    uuid,
  p_talla          text,
  p_cantidad       integer,
  p_costo_unitario integer,
  p_usuario_id     uuid,
  p_compra_item_id uuid default null,
  p_sede_id        uuid default null,
  p_notas          text default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_id   uuid;
  v_sede uuid;
begin
  if p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;

  v_sede := coalesce(p_sede_id, (select id from sedes where codigo = 'TR' limit 1));

  insert into movimientos_inventario (
    articulo_id, talla, sede_id, delta, tipo,
    compra_item_id, costo_unitario_cop, usuario_id, notas
  )
  values (
    p_articulo_id, nullif(p_talla, ''), v_sede, p_cantidad, 'entrada',
    p_compra_item_id, p_costo_unitario, p_usuario_id, p_notas
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- transferir_stock: + p_talla
create or replace function transferir_stock(
  p_articulo_id  uuid,
  p_talla        text,
  p_sede_origen  uuid,
  p_sede_destino uuid,
  p_cantidad     integer,
  p_usuario_id   uuid,
  p_notas        text default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_transferencia_id uuid := uuid_generate_v4();
  v_costo            integer;
  v_tipo             text;
  v_talla_n          text := nullif(p_talla, '');
begin
  if p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;
  if p_sede_origen is not distinct from p_sede_destino then
    raise exception 'El origen y el destino no pueden ser iguales';
  end if;

  select costo_promedio into v_costo
  from vista_costo_promedio
  where articulo_id = p_articulo_id and (talla is not distinct from v_talla_n);

  v_tipo := case when p_sede_origen is null then 'asignacion' else 'transferencia' end;

  insert into movimientos_inventario (
    articulo_id, talla, sede_id, delta, tipo, transferencia_id, costo_unitario_cop, usuario_id, notas
  ) values (
    p_articulo_id, v_talla_n, p_sede_origen, -p_cantidad, v_tipo, v_transferencia_id, v_costo, p_usuario_id, p_notas
  );

  insert into movimientos_inventario (
    articulo_id, talla, sede_id, delta, tipo, transferencia_id, costo_unitario_cop, usuario_id, notas
  ) values (
    p_articulo_id, v_talla_n, p_sede_destino, p_cantidad, v_tipo, v_transferencia_id, v_costo, p_usuario_id, p_notas
  );

  return v_transferencia_id;
end;
$$;

-- registrar_venta_inmediata: la talla viene en cada item del JSON.
create or replace function registrar_venta_inmediata(
  p_numero_orden text,
  p_sede_id      uuid,
  p_asesor_id    uuid,
  p_cliente_id   uuid,
  p_total        integer,
  p_items        jsonb,
  p_abono        integer,
  p_metodo_pago  text,
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
    insert into pagos (pedido_id, monto, metodo, asesor_id)
    values (v_pedido_id, p_abono, p_metodo_pago, p_asesor_id);
  end if;

  insert into historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id)
  values ('pedidos', v_pedido_id, 'estado', null, 'entregado', p_asesor_id);

  return v_pedido_id;
end;
$$;
