-- Migration 107: envíos entre sedes (remisiones)
--
-- Un envío agrupa lo que sale en una caja hacia otra sede (típicamente
-- TR → Santa Rosa): pedidos (escaneados por su código de barras / número)
-- y artículos sueltos que no son pedidos (por código de artículo + talla).
-- Genera un documento imprimible para control de despacho y recepción.

create table if not exists envios (
  id              uuid primary key default gen_random_uuid(),
  consecutivo     bigint generated always as identity,
  destino_sede_id uuid not null references sedes(id),
  origen_sede_id  uuid references sedes(id),
  notas           text,
  creado_por      uuid references usuarios(id),
  creado_en       timestamptz not null default now()
);
create index if not exists idx_envios_creado on envios (creado_en desc);

create table if not exists envio_items (
  id           uuid primary key default gen_random_uuid(),
  envio_id     uuid not null references envios(id) on delete cascade,
  -- Pedido enviado (referencia + copia del número por si el pedido se borra)
  pedido_id    uuid references pedidos(id) on delete set null,
  numero_orden text,
  -- Artículo suelto (no pedido): código + talla
  codigo       text,
  talla        text,
  cantidad     integer not null default 1 check (cantidad > 0),
  descripcion  text,
  creado_en    timestamptz not null default now(),
  -- Cada ítem es o un pedido o un artículo
  check (pedido_id is not null or numero_orden is not null or codigo is not null)
);
create index if not exists idx_envio_items_envio on envio_items (envio_id);

alter table envios enable row level security;
create policy envios_select on envios for select using (auth.uid() is not null);
create policy envios_write  on envios for all    using (auth_no_es_visor()) with check (auth_no_es_visor());

alter table envio_items enable row level security;
create policy envio_items_select on envio_items for select using (auth.uid() is not null);
create policy envio_items_write  on envio_items for all    using (auth_no_es_visor()) with check (auth_no_es_visor());
