-- RONALDO AI: agente de WhatsApp.
-- Reversible:
--   drop table if exists ronaldo_mensajes_log, ronaldo_conversaciones, ronaldo_acceso cascade;
-- Solo el service role (webhook) escribe aquí; RLS sin políticas para authenticated
-- salvo lectura del admin.

-- Números de WhatsApp autorizados para hablar con RONALDO
create table if not exists ronaldo_acceso (
  telefono    text primary key,            -- formato de Meta, sin +: '573001234567'
  usuario_id  uuid not null references usuarios(id) on delete cascade,
  activo      boolean not null default true,
  creado_en   timestamptz not null default now()
);

-- Hilo de conversación. Se abre uno nuevo si el último lleva >6h sin actividad.
create table if not exists ronaldo_conversaciones (
  id                uuid primary key default gen_random_uuid(),
  telefono          text not null,
  mensajes          jsonb not null default '[]',   -- [{role, content: string}]
  ultima_actividad  timestamptz not null default now(),
  creado_en         timestamptz not null default now()
);
create index if not exists ronaldo_conversaciones_tel_idx
  on ronaldo_conversaciones (telefono, ultima_actividad desc);

-- Auditoría de cada mensaje. wamid único = deduplicación de reintentos de Meta.
create table if not exists ronaldo_mensajes_log (
  id            uuid primary key default gen_random_uuid(),
  wamid         text unique,                 -- id del mensaje entrante en Meta
  telefono      text not null,
  direccion     text not null check (direccion in ('entrante', 'saliente')),
  contenido     text not null,
  herramientas  int not null default 0,
  error         text,
  creado_en     timestamptz not null default now()
);
create index if not exists ronaldo_mensajes_log_tel_idx
  on ronaldo_mensajes_log (telefono, creado_en desc);

alter table ronaldo_acceso         enable row level security;
alter table ronaldo_conversaciones enable row level security;
alter table ronaldo_mensajes_log   enable row level security;

create policy ronaldo_acceso_admin_lee on ronaldo_acceso for select
  using (exists (select 1 from usuarios u where u.id = auth.uid() and u.rol = 'admin'));
create policy ronaldo_conversaciones_admin_lee on ronaldo_conversaciones for select
  using (exists (select 1 from usuarios u where u.id = auth.uid() and u.rol = 'admin'));
create policy ronaldo_log_admin_lee on ronaldo_mensajes_log for select
  using (exists (select 1 from usuarios u where u.id = auth.uid() and u.rol = 'admin'));
