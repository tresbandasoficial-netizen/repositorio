-- Migration 115: tareas para los asesores
--
-- El admin asigna tareas a un asesor; el asesor la marca como completada
-- cuando termina. La demora se mide entre creado_en y completada_en.

create table if not exists tareas (
  id            uuid primary key default gen_random_uuid(),
  titulo        text not null,
  descripcion   text,
  asignado_a    uuid not null references usuarios(id),
  creada_por    uuid references usuarios(id),
  estado        text not null default 'pendiente' check (estado in ('pendiente','completada')),
  creado_en     timestamptz not null default now(),
  completada_en timestamptz,
  -- coherencia: completada ⇔ tiene fecha de completado
  check ((estado = 'completada') = (completada_en is not null))
);
create index if not exists idx_tareas_asignado on tareas (asignado_a, estado, creado_en desc);

alter table tareas enable row level security;

-- El asesor ve solo sus tareas; el admin ve todas.
create policy tareas_select on tareas for select
  using (asignado_a = auth.uid() or auth_es_admin());

-- Solo el admin crea y elimina tareas.
create policy tareas_insert on tareas for insert with check (auth_es_admin());
create policy tareas_delete on tareas for delete using (auth_es_admin());

-- El asesor puede actualizar SUS tareas (marcarlas completadas); el admin cualquiera.
create policy tareas_update on tareas for update
  using (asignado_a = auth.uid() or auth_es_admin())
  with check (asignado_a = auth.uid() or auth_es_admin());
