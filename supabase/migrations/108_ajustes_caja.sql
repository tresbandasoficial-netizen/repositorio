-- Migration 108: registro de cuadres/ajustes de caja
--
-- Cuando se cuadra una cuenta contra el conteo físico (mecanismo de corte:
-- saldo_inicial + fecha_corte), la diferencia queda registrada aquí para que
-- aparezca en los movimientos de la cuenta con fecha, monto y responsable.
-- Es un registro INFORMATIVO: el valor del ajuste ya queda absorbido en
-- saldo_inicial, por eso NO se suma en el cálculo del saldo.

create table if not exists ajustes_caja (
  id             uuid primary key default gen_random_uuid(),
  cuenta_id      uuid not null references cuentas(id) on delete cascade,
  fecha          date not null default (now() at time zone 'America/Bogota')::date,
  diferencia     integer not null,          -- contado − sistema (+ sobrante / − faltante)
  saldo_contado  integer not null,          -- lo que se contó físicamente
  motivo         text,
  usuario_id     uuid references usuarios(id),
  creado_en      timestamptz not null default now()
);
create index if not exists idx_ajustes_caja_cuenta on ajustes_caja (cuenta_id, fecha desc);

alter table ajustes_caja enable row level security;
create policy ajustes_caja_select on ajustes_caja for select using (auth.uid() is not null);
create policy ajustes_caja_write  on ajustes_caja for all    using (auth_es_admin()) with check (auth_es_admin());
