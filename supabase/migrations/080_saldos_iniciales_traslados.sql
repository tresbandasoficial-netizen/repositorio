-- Migration 080: Saldos iniciales por cuenta + traslados entre cuentas
--
-- 1. Corte de caja: cada cuenta arranca en un saldo real a una fecha de corte.
--    El saldo actual = saldo_inicial + (ingresos − egresos) desde la fecha_corte.
--    Así "el flujo queda en cero" desde el corte sin borrar el histórico.
--
-- 2. Traslados entre cuentas: registra movimientos de plata de una cuenta a otra
--    (ej: la "Entrega de efectivo" cuando los asesores le dan el dinero al dueño,
--    que baja "Efectivo" y sube "Caja Bucaramanga").

-- ── 1. Saldo inicial + fecha de corte en cuentas ─────────────────────────────
alter table cuentas
  add column if not exists saldo_inicial integer not null default 0,
  add column if not exists fecha_corte   date;

-- ── 2. Traslados entre cuentas ───────────────────────────────────────────────
create table if not exists traslados_caja (
  id                uuid        primary key default gen_random_uuid(),
  origen_cuenta_id  uuid        not null references cuentas(id),
  destino_cuenta_id uuid        not null references cuentas(id),
  monto             integer     not null check (monto > 0),
  fecha             date        not null default hoy_bogota(),
  responsable_id    uuid        references usuarios(id),
  notas             text,
  creado_en         timestamptz not null default now(),
  check (origen_cuenta_id <> destino_cuenta_id)
);

alter table traslados_caja enable row level security;

create policy "traslados_read" on traslados_caja for select using (true);

create policy "traslados_write" on traslados_caja for insert with check (
  exists (select 1 from usuarios where id = auth.uid() and rol in ('asesor', 'admin'))
);
