-- Migration 027: Inventario (CPP) + Facturación + Cuentas por Cobrar
--
-- Arquitectura aprobada:
--   * articulos              → catálogo global (marca + nombre + talla)
--   * movimientos_inventario → libro mayor (ledger) de stock por sede
--   * stock                  → SIEMPRE = SUM(delta) sobre el ledger (puede ser negativo)
--   * costo                  → Costo Promedio Ponderado (CPP), sin selección de lotes
--   * facturas               → agrupa 1..N pedidos entregados del MISMO cliente/sede
--   * pagos_factura          → abonos posteriores a la emisión de la factura
--
-- Reglas de negocio:
--   * Bucaramanga (TR) es la sede principal y CENTRO DE DISTRIBUCIÓN.
--   * Compra sin pedido_id  → entrada al inventario de Bucaramanga por defecto
--   * Compra con pedido_id  → va directo al pedido, NO entra al inventario general
--   * Venta inmediata       → salida automática del inventario de la sede del asesor (CPP)
--   * Encargo               → NO descuenta inventario
--   * Transferencias        → -origen / +destino, atómicas, las hace el admin
--   * Una sede puede vender stock que llegó a otra sede, previa transferencia.
--
-- El asesor nunca selecciona lotes ni movimientos: todo es automático.
-- Todo lo nuevo respeta el modelo multi-sede existente (auth_es_admin / auth_sede_id).

-- ════════════════════════════════════════════════════════════════════════════
-- 1. CATÁLOGO DE ARTÍCULOS
-- ════════════════════════════════════════════════════════════════════════════

create table articulos (
  id        uuid primary key default uuid_generate_v4(),
  nombre    text not null,
  marca     text not null,
  talla     text,
  categoria text check (categoria in ('tenis', 'ropa', 'accesorio', 'otro')),
  activo    boolean not null default true,
  creado_en timestamptz not null default now()
);

-- Unicidad lógica: una combinación marca+nombre+talla es un único artículo.
create unique index articulos_unico
  on articulos (lower(marca), lower(nombre), coalesce(lower(talla), ''));

-- Búsqueda difusa por nombre (mismo patrón que clientes).
create index idx_articulos_nombre_trgm on articulos using gin (nombre gin_trgm_ops);
create index idx_articulos_activo on articulos (activo) where activo = true;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. VÍNCULO DE PRODUCTOS AL CATÁLOGO (columnas nuevas)
-- ════════════════════════════════════════════════════════════════════════════

-- En compras: cada ítem comprado puede mapear a un artículo del catálogo.
alter table compra_items add column articulo_id uuid references articulos(id);
create index idx_compra_items_articulo on compra_items (articulo_id);

-- En pedidos: cada ítem vendido puede mapear a un artículo (obligatorio en venta
-- inmediata para poder descontar inventario; opcional en encargos).
alter table pedido_items add column articulo_id uuid references articulos(id);
create index idx_pedido_items_articulo on pedido_items (articulo_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. LEDGER DE INVENTARIO
-- ════════════════════════════════════════════════════════════════════════════

create table movimientos_inventario (
  id                 uuid primary key default uuid_generate_v4(),
  articulo_id        uuid not null references articulos(id),
  sede_id            uuid references sedes(id),   -- NULL = inventario central
  delta              integer not null,            -- + entrada / - salida
  tipo               text not null check (tipo in (
                       'entrada',        -- compra registrada
                       'asignacion',     -- central -> sede
                       'transferencia',  -- sede -> sede
                       'salida',         -- venta inmediata
                       'ajuste'          -- corrección manual del admin
                     )),
  -- Trazabilidad (auditoría). El asesor nunca toca estos campos.
  compra_item_id     uuid references compra_items(id),
  pedido_id          uuid references pedidos(id),
  transferencia_id   uuid,                        -- agrupa las 2 filas de una transferencia
  costo_unitario_cop integer,                     -- entrada: costo real; salida: CPP snapshot
  usuario_id         uuid not null references usuarios(id),
  notas              text,
  creado_en          timestamptz not null default now()
);

create index idx_mov_articulo_sede on movimientos_inventario (articulo_id, sede_id);
create index idx_mov_tipo          on movimientos_inventario (tipo);
create index idx_mov_compra_item   on movimientos_inventario (compra_item_id);
create index idx_mov_pedido        on movimientos_inventario (pedido_id);
create index idx_mov_transferencia on movimientos_inventario (transferencia_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. FACTURACIÓN
-- ════════════════════════════════════════════════════════════════════════════

-- Secuencia de numeración atómica por sede + año.
create table factura_secuencias (
  sede_id uuid not null references sedes(id),
  anio    integer not null,
  ultimo  integer not null default 0,
  primary key (sede_id, anio)
);

create table facturas (
  id                uuid primary key default uuid_generate_v4(),
  numero_factura    text not null unique,        -- FAC-TR-2026-0001
  cliente_id        uuid not null references clientes(id),
  sede_id           uuid not null references sedes(id),
  asesor_id         uuid not null references usuarios(id),
  fecha_factura     date not null default current_date,
  fecha_vencimiento date not null,
  -- total = deuda NETA al emitir = SUM(pedidos.total) - SUM(abonos previos en `pagos`)
  total             integer not null,
  estado            text not null default 'pendiente'
                    check (estado in ('pendiente', 'pagada', 'vencida', 'anulada')),
  notas             text,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now()
);

create index idx_facturas_cliente on facturas (cliente_id);
create index idx_facturas_sede    on facturas (sede_id);
create index idx_facturas_estado  on facturas (estado);
create index idx_facturas_vence   on facturas (fecha_vencimiento);

-- Un pedido pertenece a una sola factura (o ninguna).
alter table pedidos add column factura_id uuid references facturas(id);
create index idx_pedidos_factura on pedidos (factura_id);

-- Tipo de pedido: encargo (flujo normal) o venta inmediata (nace entregado).
alter table pedidos add column tipo text not null default 'encargo'
  check (tipo in ('encargo', 'venta_inmediata'));
create index idx_pedidos_tipo on pedidos (tipo);

-- Abonos posteriores a la emisión de la factura.
create table pagos_factura (
  id          uuid primary key default uuid_generate_v4(),
  factura_id  uuid not null references facturas(id) on delete cascade,
  monto       integer not null check (monto > 0),
  metodo      text not null,
  fecha       date not null default current_date,
  asesor_id   uuid not null references usuarios(id),
  notas       text,
  creado_en   timestamptz not null default now()
);

create index idx_pagos_factura_factura on pagos_factura (factura_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 5. VISTAS
-- ════════════════════════════════════════════════════════════════════════════

-- 5.1 Costo Promedio Ponderado por artículo (global, viaja con el artículo).
create view vista_costo_promedio as
select
  articulo_id,
  round(
    sum(delta * costo_unitario_cop)::numeric / nullif(sum(delta), 0)
  )::integer as costo_promedio
from movimientos_inventario
where tipo = 'entrada' and costo_unitario_cop is not null
group by articulo_id;

-- 5.2 Stock por artículo y sede (NULL = central). Puede ser negativo.
create view vista_stock_por_sede as
select
  m.articulo_id,
  a.nombre,
  a.marca,
  a.talla,
  a.categoria,
  m.sede_id,
  sum(m.delta)::integer as stock
from movimientos_inventario m
join articulos a on a.id = m.articulo_id
group by m.articulo_id, a.nombre, a.marca, a.talla, a.categoria, m.sede_id;

-- 5.3 Facturas con saldo calculado y días de atraso.
create view vista_facturas as
select
  f.id,
  f.numero_factura,
  f.cliente_id,
  c.nombre               as cliente_nombre,
  c.telefono_normalizado as cliente_telefono,
  f.sede_id,
  s.codigo               as sede_codigo,
  s.nombre               as sede_nombre,
  f.asesor_id,
  u.nombre               as asesor_nombre,
  f.fecha_factura,
  f.fecha_vencimiento,
  f.total,
  coalesce(pg.total_abonado, 0)::integer            as total_abonado,
  (f.total - coalesce(pg.total_abonado, 0))::integer as saldo,
  case
    when f.estado in ('pagada', 'anulada') then 0
    when f.fecha_vencimiento < current_date
      then (current_date - f.fecha_vencimiento)
    else 0
  end as dias_atraso,
  f.estado,
  f.notas,
  f.creado_en
from facturas f
join clientes c on c.id = f.cliente_id
join sedes    s on s.id = f.sede_id
join usuarios u on u.id = f.asesor_id
left join (
  select factura_id, sum(monto) as total_abonado
  from pagos_factura
  group by factura_id
) pg on pg.factura_id = f.id;

-- 5.4 Morosos: facturas con saldo > 0 y vencidas.
create view vista_morosos as
select *
from vista_facturas
where saldo > 0
  and estado not in ('pagada', 'anulada')
  and fecha_vencimiento < current_date;

-- 5.5 Utilidad por pedido (solo admin a nivel de página).
--     precio_venta - CPP, por ítem que tenga artículo vinculado.
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
left join vista_costo_promedio cp on cp.articulo_id = pi.articulo_id
where p.estado != 'cancelado'
group by p.id, p.numero_orden, p.tipo, p.sede_id, p.cliente_id, p.fecha_creacion;

-- 5.6 Utilidad por factura (suma de sus pedidos).
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
join pedidos p           on p.factura_id = f.id
join vista_utilidad_pedidos up on up.pedido_id = p.id
where f.estado != 'anulada'
group by f.id, f.numero_factura, f.sede_id, f.cliente_id, f.fecha_factura;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. FUNCIONES (atómicas, security definer)
-- ════════════════════════════════════════════════════════════════════════════

-- 6.1 Siguiente número de factura por sede+año, atómico.
create or replace function siguiente_numero_factura(p_sede_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  v_anio   integer := extract(year from current_date);
  v_codigo text;
  v_num    integer;
begin
  select codigo into v_codigo from sedes where id = p_sede_id;
  if v_codigo is null then
    raise exception 'Sede no encontrada: %', p_sede_id;
  end if;

  insert into factura_secuencias (sede_id, anio, ultimo)
  values (p_sede_id, v_anio, 1)
  on conflict (sede_id, anio)
  do update set ultimo = factura_secuencias.ultimo + 1
  returning ultimo into v_num;

  return 'FAC-' || v_codigo || '-' || v_anio || '-' || lpad(v_num::text, 4, '0');
end;
$$;

-- 6.2 Registrar entrada de inventario desde una compra.
--     Si no se indica sede, el stock entra a BUCARAMANGA (TR) por defecto:
--     es la sede principal y centro de distribución.
create or replace function registrar_entrada_inventario(
  p_articulo_id    uuid,
  p_cantidad       integer,
  p_costo_unitario integer,
  p_usuario_id     uuid,
  p_compra_item_id uuid default null,
  p_sede_id        uuid default null,   -- NULL = Bucaramanga por defecto
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

  -- Por defecto el inventario llega a Bucaramanga (centro de distribución).
  v_sede := coalesce(p_sede_id, (select id from sedes where codigo = 'TR' limit 1));

  insert into movimientos_inventario (
    articulo_id, sede_id, delta, tipo,
    compra_item_id, costo_unitario_cop, usuario_id, notas
  )
  values (
    p_articulo_id, v_sede, p_cantidad, 'entrada',
    p_compra_item_id, p_costo_unitario, p_usuario_id, p_notas
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- 6.3 Transferir stock entre ubicaciones (central <-> sede, sede <-> sede).
--     Permite stock negativo en origen (regla de negocio aprobada).
create or replace function transferir_stock(
  p_articulo_id  uuid,
  p_sede_origen  uuid,   -- NULL = central
  p_sede_destino uuid,   -- NULL = central
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
begin
  if p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;
  if p_sede_origen is not distinct from p_sede_destino then
    raise exception 'El origen y el destino no pueden ser iguales';
  end if;

  select costo_promedio into v_costo
  from vista_costo_promedio where articulo_id = p_articulo_id;

  -- central -> sede = asignación; sede -> sede = transferencia
  v_tipo := case when p_sede_origen is null then 'asignacion' else 'transferencia' end;

  -- Salida del origen
  insert into movimientos_inventario (
    articulo_id, sede_id, delta, tipo, transferencia_id, costo_unitario_cop, usuario_id, notas
  ) values (
    p_articulo_id, p_sede_origen, -p_cantidad, v_tipo, v_transferencia_id, v_costo, p_usuario_id, p_notas
  );

  -- Entrada al destino
  insert into movimientos_inventario (
    articulo_id, sede_id, delta, tipo, transferencia_id, costo_unitario_cop, usuario_id, notas
  ) values (
    p_articulo_id, p_sede_destino, p_cantidad, v_tipo, v_transferencia_id, v_costo, p_usuario_id, p_notas
  );

  return v_transferencia_id;
end;
$$;

-- 6.4 Registrar venta inmediata: pedido entregado + salida de inventario + pago.
create or replace function registrar_venta_inmediata(
  p_numero_orden text,
  p_sede_id      uuid,
  p_asesor_id    uuid,
  p_cliente_id   uuid,
  p_total        integer,
  p_items        jsonb,   -- [{articulo_id, marca, descripcion, talla, cantidad, precio_venta}]
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
  v_costo      integer;
begin
  -- Pedido nace ENTREGADO (entrega inmediata).
  insert into pedidos (
    numero_orden, sede_id, asesor_id, cliente_id,
    total, tipo_entrega, direccion_entrega, notas, estado, tipo
  )
  values (
    p_numero_orden, p_sede_id, p_asesor_id, p_cliente_id,
    p_total, 'sede', null, p_notas, 'entregado', 'venta_inmediata'
  )
  returning id into v_pedido_id;

  -- Items + salida de inventario por cada ítem con artículo.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_articulo := nullif(v_item->>'articulo_id', '')::uuid;
    v_cantidad := (v_item->>'cantidad')::integer;

    insert into pedido_items (pedido_id, articulo_id, marca, descripcion, talla, cantidad, precio_venta)
    values (
      v_pedido_id,
      v_articulo,
      v_item->>'marca',
      v_item->>'descripcion',
      nullif(v_item->>'talla', ''),
      v_cantidad,
      (v_item->>'precio_venta')::integer
    );

    -- Descontar inventario (CPP snapshot). Permite stock negativo.
    if v_articulo is not null then
      select costo_promedio into v_costo
      from vista_costo_promedio where articulo_id = v_articulo;

      insert into movimientos_inventario (
        articulo_id, sede_id, delta, tipo, pedido_id, costo_unitario_cop, usuario_id
      )
      values (
        v_articulo, p_sede_id, -v_cantidad, 'salida', v_pedido_id, v_costo, p_asesor_id
      );
    end if;
  end loop;

  -- Pago inicial (si lo hubo).
  if p_abono > 0 then
    insert into pagos (pedido_id, monto, metodo, asesor_id)
    values (v_pedido_id, p_abono, p_metodo_pago, p_asesor_id);
  end if;

  insert into historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id)
  values ('pedidos', v_pedido_id, 'estado', null, 'entregado', p_asesor_id);

  return v_pedido_id;
end;
$$;

-- 6.5 Crear factura agrupando 1..N pedidos entregados del mismo cliente/sede.
create or replace function crear_factura(
  p_cliente_id       uuid,
  p_sede_id          uuid,
  p_asesor_id        uuid,
  p_fecha_vencimiento date,
  p_pedido_ids       uuid[],
  p_notas            text default null,
  p_abono_inicial    integer default 0,
  p_metodo_abono     text default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_factura_id uuid;
  v_numero     text;
  v_bruto      integer;
  v_prepagado  integer;
  v_neto       integer;
  v_count      integer;
begin
  if array_length(p_pedido_ids, 1) is null then
    raise exception 'Debe incluir al menos un pedido';
  end if;

  -- Validar que todos los pedidos son del cliente/sede, están entregados y sin factura.
  select count(*) into v_count
  from pedidos
  where id = any(p_pedido_ids)
    and cliente_id = p_cliente_id
    and sede_id = p_sede_id
    and estado = 'entregado'
    and factura_id is null;

  if v_count <> array_length(p_pedido_ids, 1) then
    raise exception 'Algún pedido no es válido: debe estar entregado, sin factura y pertenecer al mismo cliente y sede';
  end if;

  -- Total bruto = suma de los pedidos.
  select coalesce(sum(total), 0) into v_bruto
  from pedidos where id = any(p_pedido_ids);

  -- Prepagado = abonos previos registrados en `pagos` de esos pedidos.
  select coalesce(sum(pg.monto), 0) into v_prepagado
  from pagos pg where pg.pedido_id = any(p_pedido_ids);

  v_neto := v_bruto - v_prepagado;
  if v_neto < 0 then v_neto := 0; end if;

  v_numero := siguiente_numero_factura(p_sede_id);

  insert into facturas (
    numero_factura, cliente_id, sede_id, asesor_id, fecha_vencimiento, total, notas
  )
  values (
    v_numero, p_cliente_id, p_sede_id, p_asesor_id, p_fecha_vencimiento, v_neto, p_notas
  )
  returning id into v_factura_id;

  -- Vincular pedidos.
  update pedidos set factura_id = v_factura_id where id = any(p_pedido_ids);

  -- Abono inicial contra la factura (si lo hubo).
  if p_abono_inicial > 0 then
    insert into pagos_factura (factura_id, monto, metodo, asesor_id)
    values (v_factura_id, p_abono_inicial, coalesce(p_metodo_abono, 'efectivo'), p_asesor_id);

    if p_abono_inicial >= v_neto then
      update facturas set estado = 'pagada', actualizado_en = now() where id = v_factura_id;
    end if;
  end if;

  return v_factura_id;
end;
$$;

-- 6.6 Registrar abono contra una factura. Marca como pagada si el saldo llega a 0.
create or replace function registrar_pago_factura(
  p_factura_id uuid,
  p_monto      integer,
  p_metodo     text,
  p_fecha      date,
  p_asesor_id  uuid,
  p_notas      text default null
)
returns void
language plpgsql
security definer
as $$
declare
  v_total    integer;
  v_estado   text;
  v_abonado  integer;
begin
  select total, estado into v_total, v_estado
  from facturas where id = p_factura_id for update;

  if not found then
    raise exception 'Factura no encontrada';
  end if;
  if v_estado = 'anulada' then
    raise exception 'No se pueden registrar abonos en una factura anulada';
  end if;
  if p_monto <= 0 then
    raise exception 'El monto debe ser mayor a cero';
  end if;

  select coalesce(sum(monto), 0) into v_abonado
  from pagos_factura where factura_id = p_factura_id;

  if p_monto > (v_total - v_abonado) then
    raise exception 'El monto supera el saldo pendiente';
  end if;

  insert into pagos_factura (factura_id, monto, metodo, fecha, asesor_id, notas)
  values (p_factura_id, p_monto, p_metodo, p_fecha, p_asesor_id, p_notas);

  if (v_abonado + p_monto) >= v_total then
    update facturas set estado = 'pagada', actualizado_en = now() where id = p_factura_id;
  end if;
end;
$$;

-- 6.7 Anular factura: libera los pedidos vinculados (solo admin desde el action).
create or replace function anular_factura(p_factura_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update pedidos set factura_id = null where factura_id = p_factura_id;
  update facturas set estado = 'anulada', actualizado_en = now() where id = p_factura_id;
end;
$$;

-- 6.8 Marcar facturas vencidas (para el cron). Idempotente.
create or replace function marcar_facturas_vencidas()
returns integer
language plpgsql
security definer
as $$
declare
  v_count integer;
begin
  with vencidas as (
    update facturas f
    set estado = 'vencida', actualizado_en = now()
    where f.estado = 'pendiente'
      and f.fecha_vencimiento < current_date
      and (f.total - coalesce(
            (select sum(monto) from pagos_factura where factura_id = f.id), 0)) > 0
    returning 1
  )
  select count(*) into v_count from vencidas;
  return v_count;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 7. RLS — Control de acceso por rol y sede
-- ════════════════════════════════════════════════════════════════════════════

alter table articulos              enable row level security;
alter table movimientos_inventario enable row level security;
alter table facturas               enable row level security;
alter table pagos_factura          enable row level security;
alter table factura_secuencias     enable row level security;

-- ── ARTÍCULOS: catálogo global. Todos leen; solo admin escribe. ──────────────
create policy "articulos_select" on articulos
  for select using (auth.role() = 'authenticated');
create policy "articulos_admin" on articulos
  for all using (auth_es_admin()) with check (auth_es_admin());

-- ── MOVIMIENTOS: admin total; asesor lee su sede + central. ──────────────────
-- Las salidas/transferencias se crean vía funciones security definer (bypass RLS),
-- por eso INSERT directo queda restringido a admin.
create policy "mov_select" on movimientos_inventario
  for select using (
    auth_es_admin()
    or sede_id = auth_sede_id()
    or sede_id is null
  );
create policy "mov_admin" on movimientos_inventario
  for all using (auth_es_admin()) with check (auth_es_admin());

-- ── FACTURAS: asesor solo su sede; admin todas. ──────────────────────────────
create policy "facturas_select" on facturas
  for select using (auth_es_admin() or sede_id = auth_sede_id());
create policy "facturas_insert" on facturas
  for insert with check (auth_es_admin() or sede_id = auth_sede_id());
create policy "facturas_update" on facturas
  for update using (auth_es_admin() or sede_id = auth_sede_id());

-- ── PAGOS_FACTURA: hereda acceso de la factura padre. ────────────────────────
create policy "pagos_factura_select" on pagos_factura
  for select using (
    exists (
      select 1 from facturas f
      where f.id = factura_id
        and (auth_es_admin() or f.sede_id = auth_sede_id())
    )
  );
create policy "pagos_factura_insert" on pagos_factura
  for insert with check (
    exists (
      select 1 from facturas f
      where f.id = factura_id
        and (auth_es_admin() or f.sede_id = auth_sede_id())
    )
  );

-- ── FACTURA_SECUENCIAS: solo vía función security definer (sin policies). ─────
-- RLS activo + sin policy = bloqueado para clientes normales; las funciones
-- security definer la usan sin problema.
