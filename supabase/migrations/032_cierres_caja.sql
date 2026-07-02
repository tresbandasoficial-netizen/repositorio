-- Tabla de cierres de caja diarios
-- Almacena un snapshot del flujo de cada cuenta al momento del cierre

create table if not exists cierres_caja (
  id              uuid primary key default gen_random_uuid(),
  fecha           date not null,
  hora_cierre     timestamptz not null default now(),
  sede_id         uuid not null references sedes(id),
  usuario_id      uuid not null references usuarios(id),
  notas           text,
  detalle_cuentas jsonb not null default '[]',
  total_ingresos  numeric(15,2) not null default 0,
  total_egresos   numeric(15,2) not null default 0,
  neto            numeric(15,2) not null default 0,
  creado_en       timestamptz not null default now(),

  unique (sede_id, fecha)
);

-- RLS
alter table cierres_caja enable row level security;

create policy "Usuarios autenticados pueden ver cierres de su sede"
  on cierres_caja for select
  using (
    auth.uid() in (
      select id from usuarios where sede_id = cierres_caja.sede_id or rol = 'admin'
    )
  );

create policy "Asesores y admins pueden crear cierres"
  on cierres_caja for insert
  with check (
    auth.uid() in (
      select id from usuarios where rol in ('asesor', 'admin')
    )
  );
