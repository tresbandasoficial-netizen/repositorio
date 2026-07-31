-- Migration 148: registro de asistencia (llegada / salida)
--
-- Cada fila es un turno: el asesor marca la llegada al entrar a la sede y la
-- salida al irse. Puede marcar varias veces el mismo día (p.ej. sale a
-- almorzar y vuelve = dos turnos). salida NULL = turno abierto.

create table if not exists asistencia (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id),
  sede_id    uuid references sedes(id),
  llegada    timestamptz not null default now(),
  salida     timestamptz,
  check (salida is null or salida >= llegada)
);
create index if not exists idx_asistencia_usuario on asistencia (usuario_id, llegada desc);

alter table asistencia enable row level security;

-- El asesor ve solo sus marcas; el admin todas.
create policy asistencia_select on asistencia for select
  using (usuario_id = auth.uid() or auth_es_admin());

-- Cada quien marca su propia llegada.
create policy asistencia_insert on asistencia for insert
  with check (usuario_id = auth.uid() or auth_es_admin());

-- El dueño cierra su turno (marca salida); el admin puede corregir.
create policy asistencia_update on asistencia for update
  using (usuario_id = auth.uid() or auth_es_admin())
  with check (usuario_id = auth.uid() or auth_es_admin());

-- Solo el admin borra marcas erradas.
create policy asistencia_delete on asistencia for delete
  using (auth_es_admin());
