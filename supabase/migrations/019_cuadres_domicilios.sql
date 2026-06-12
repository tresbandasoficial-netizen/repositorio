-- Migration 019: registro de cuadres diarios de domicilios
--
-- Guarda el momento en que se cerró el cuadre de un día,
-- quién lo hizo y los totales al momento del cierre.

create table cuadres_domicilios (
  id           uuid        primary key default uuid_generate_v4(),
  fecha        date        not null unique,
  cerrado_por  uuid        not null references usuarios(id),
  cerrado_en   timestamptz not null default now(),
  total_neto   integer     not null default 0,
  resumen      jsonb
);

alter table cuadres_domicilios enable row level security;

create policy "cuadres_select" on cuadres_domicilios
  for select using (auth.role() = 'authenticated');

create policy "cuadres_insert" on cuadres_domicilios
  for insert with check (auth.role() = 'authenticated');
