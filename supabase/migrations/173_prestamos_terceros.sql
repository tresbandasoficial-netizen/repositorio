-- Migration 173: préstamos de terceros (deudas POR PAGAR del negocio)
--
-- Plata que alguien le prestó al negocio: se registra la deuda (acreedor,
-- monto, fecha), opcionalmente el ingreso del dinero a una cuenta (traslado
-- sin origen, mig. 081), y los abonos que se le van pagando (cada abono sale
-- de una cuenta como traslado SIN DESTINO — egreso externo, espejo de la 081;
-- no es un gasto porque devolver capital no es un gasto operativo).
-- Solo el ADMIN ve y maneja esto (finanzas privadas del negocio).

alter table traslados_caja alter column destino_cuenta_id drop not null;

-- Un traslado debe tocar al menos una cuenta (ingreso externo, egreso externo
-- o traslado interno; ambos NULL no significa nada).
alter table traslados_caja add constraint traslado_alguna_cuenta
  check (origen_cuenta_id is not null or destino_cuenta_id is not null);

create table if not exists prestamos_terceros (
  id                  uuid primary key default gen_random_uuid(),
  acreedor            text not null,
  monto               integer not null check (monto > 0),
  fecha               date not null,
  notas               text,
  ingreso_traslado_id uuid references traslados_caja(id),
  creado_por          uuid not null references usuarios(id),
  creado_en           timestamptz not null default now()
);

create table if not exists abonos_prestamos (
  id          uuid primary key default gen_random_uuid(),
  prestamo_id uuid not null references prestamos_terceros(id) on delete cascade,
  monto       integer not null check (monto > 0),
  fecha       date not null,
  cuenta_id   uuid references cuentas(id),
  traslado_id uuid references traslados_caja(id),
  notas       text,
  creado_por  uuid not null references usuarios(id),
  creado_en   timestamptz not null default now()
);

create index idx_abonos_prestamo on abonos_prestamos(prestamo_id);

alter table prestamos_terceros enable row level security;
alter table abonos_prestamos enable row level security;

create policy prestamos_admin on prestamos_terceros for all to authenticated
  using (exists (select 1 from usuarios u where u.id = auth.uid() and u.rol = 'admin'))
  with check (exists (select 1 from usuarios u where u.id = auth.uid() and u.rol = 'admin'));

create policy abonos_prestamos_admin on abonos_prestamos for all to authenticated
  using (exists (select 1 from usuarios u where u.id = auth.uid() and u.rol = 'admin'))
  with check (exists (select 1 from usuarios u where u.id = auth.uid() and u.rol = 'admin'));

revoke all on prestamos_terceros from anon;
revoke all on abonos_prestamos from anon;
