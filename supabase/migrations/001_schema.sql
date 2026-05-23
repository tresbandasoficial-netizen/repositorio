-- =========================================================
-- TR Original – Schema inicial v1
-- =========================================================

-- Extensiones necesarias
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm"; -- búsqueda difusa por nombre

-- =========================================================
-- SEDES
-- =========================================================
create table sedes (
  id          uuid primary key default uuid_generate_v4(),
  codigo      text not null unique check (codigo in ('TR', 'CR', 'SR')),
  nombre      text not null,
  direccion   text,
  creado_en   timestamptz not null default now()
);

insert into sedes (codigo, nombre) values
  ('TR', 'Bucaramanga'),
  ('CR', 'Cúcuta'),
  ('SR', 'Santa Rosa');

-- =========================================================
-- USUARIOS (extiende auth.users de Supabase)
-- =========================================================
create table usuarios (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  nombre      text not null,
  rol         text not null check (rol in ('asesor', 'admin')),
  sede_id     uuid references sedes(id),
  activo      boolean not null default true,
  creado_en   timestamptz not null default now()
);

-- =========================================================
-- CLIENTES
-- =========================================================
create table clientes (
  id                   uuid primary key default uuid_generate_v4(),
  telefono_normalizado text not null unique,
  nombre               text not null,
  cedula               text,
  email                text,
  notas                text,
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now()
);

create index idx_clientes_nombre on clientes using gin (nombre gin_trgm_ops);

-- =========================================================
-- PEDIDOS
-- =========================================================
create table pedidos (
  id                uuid primary key default uuid_generate_v4(),
  numero_orden      text not null unique,
  sede_id           uuid not null references sedes(id),
  cliente_id        uuid not null references clientes(id),
  asesor_id         uuid not null references usuarios(id),
  estado            text not null default 'pendiente'
                    check (estado in ('pendiente','comprado','llego_usa','bodega_colombia','en_sede','entregado','cancelado')),
  total             integer not null check (total >= 0),
  tipo_entrega      text not null default 'sede'
                    check (tipo_entrega in ('domicilio', 'sede')),
  direccion_entrega text,
  notas             text,
  fecha_creacion    timestamptz not null default now(),
  fecha_actualizacion timestamptz not null default now()
);

create index idx_pedidos_sede_fecha   on pedidos (sede_id, fecha_creacion);
create index idx_pedidos_asesor       on pedidos (asesor_id);
create index idx_pedidos_cliente      on pedidos (cliente_id);
create index idx_pedidos_estado       on pedidos (estado);
create index idx_pedidos_numero_orden on pedidos (numero_orden);

-- =========================================================
-- PEDIDO ITEMS
-- =========================================================
create table pedido_items (
  id           uuid primary key default uuid_generate_v4(),
  pedido_id    uuid not null references pedidos(id) on delete cascade,
  marca        text not null,
  descripcion  text not null,
  talla        text,
  cantidad     integer not null check (cantidad > 0),
  precio_venta integer not null check (precio_venta >= 0)
);

create index idx_pedido_items_pedido on pedido_items (pedido_id);

-- =========================================================
-- PAGOS
-- =========================================================
create table pagos (
  id         uuid primary key default uuid_generate_v4(),
  pedido_id  uuid not null references pedidos(id) on delete cascade,
  monto      integer not null check (monto > 0),
  metodo     text not null check (metodo in ('efectivo','transferencia','datafono','otro')),
  fecha      date not null default current_date,
  asesor_id  uuid not null references usuarios(id),
  notas      text,
  creado_en  timestamptz not null default now()
);

create index idx_pagos_pedido on pagos (pedido_id);
create index idx_pagos_fecha  on pagos (fecha);

-- =========================================================
-- ALERTAS
-- =========================================================
create table alertas (
  id           uuid primary key default uuid_generate_v4(),
  pedido_id    uuid not null references pedidos(id) on delete cascade,
  tipo         text not null check (tipo in ('tiempo_excedido', 'zombie')),
  creada_en    timestamptz not null default now(),
  resuelta_en  timestamptz,
  unique (pedido_id, tipo, resuelta_en) -- evita alertas duplicadas activas
);

create index idx_alertas_pedido    on alertas (pedido_id);
create index idx_alertas_activas   on alertas (resuelta_en) where resuelta_en is null;

-- =========================================================
-- HISTORIAL DE CAMBIOS
-- =========================================================
create table historial_cambios (
  id             uuid primary key default uuid_generate_v4(),
  tabla          text not null,
  registro_id    uuid not null,
  campo          text not null,
  valor_anterior text,
  valor_nuevo    text,
  usuario_id     uuid not null references usuarios(id),
  fecha          timestamptz not null default now()
);

create index idx_historial_registro on historial_cambios (tabla, registro_id);

-- =========================================================
-- TRIGGER: actualizar fecha_actualizacion en pedidos
-- =========================================================
create or replace function actualizar_timestamp()
returns trigger language plpgsql as $$
begin
  new.fecha_actualizacion = now();
  return new;
end;
$$;

create trigger pedidos_updated_at
  before update on pedidos
  for each row execute function actualizar_timestamp();

create or replace function actualizar_timestamp_cliente()
returns trigger language plpgsql as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$;

create trigger clientes_updated_at
  before update on clientes
  for each row execute function actualizar_timestamp_cliente();

-- =========================================================
-- VISTAS (sin datos de costo — seguras para asesores)
-- =========================================================
create or replace view vista_pedidos_asesor as
  select
    p.id,
    p.numero_orden,
    p.estado,
    p.total,
    p.tipo_entrega,
    p.direccion_entrega,
    p.notas,
    p.fecha_creacion,
    p.fecha_actualizacion,
    s.codigo  as sede_codigo,
    s.nombre  as sede_nombre,
    c.nombre  as cliente_nombre,
    c.telefono_normalizado as cliente_telefono,
    u.nombre  as asesor_nombre,
    p.asesor_id,
    p.sede_id,
    p.cliente_id,
    coalesce((select sum(pg.monto) from pagos pg where pg.pedido_id = p.id), 0) as total_pagado
  from pedidos p
  join sedes s    on s.id = p.sede_id
  join clientes c on c.id = p.cliente_id
  join usuarios u on u.id = p.asesor_id;

create or replace view vista_zombies as
  select * from vista_pedidos_asesor
  where estado = 'pendiente'
    and fecha_creacion < now() - interval '30 days';

-- =========================================================
-- RLS placeholder (activado en Fase 2)
-- Por ahora solo habilitamos RLS pero sin policies restrictivas
-- para que el código funcione sin bloqueos en Fase 1.
-- =========================================================
alter table sedes              enable row level security;
alter table usuarios           enable row level security;
alter table clientes           enable row level security;
alter table pedidos            enable row level security;
alter table pedido_items       enable row level security;
alter table pagos              enable row level security;
alter table alertas            enable row level security;
alter table historial_cambios  enable row level security;

-- Policy temporal Fase 1: usuario autenticado ve todo
-- (se reemplaza en Fase 2 con policies por rol)
create policy "auth_all_sedes"            on sedes             for all using (auth.role() = 'authenticated');
create policy "auth_all_usuarios"         on usuarios          for all using (auth.role() = 'authenticated');
create policy "auth_all_clientes"         on clientes          for all using (auth.role() = 'authenticated');
create policy "auth_all_pedidos"          on pedidos           for all using (auth.role() = 'authenticated');
create policy "auth_all_pedido_items"     on pedido_items      for all using (auth.role() = 'authenticated');
create policy "auth_all_pagos"            on pagos             for all using (auth.role() = 'authenticated');
create policy "auth_all_alertas"          on alertas           for all using (auth.role() = 'authenticated');
create policy "auth_all_historial"        on historial_cambios for all using (auth.role() = 'authenticated');
