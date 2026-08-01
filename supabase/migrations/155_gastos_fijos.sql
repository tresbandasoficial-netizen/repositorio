-- Migration 155: gastos fijos mensuales + punto de equilibrio
--
-- Tabla editable SOLO por administradores (contiene sueldos — confidencial).
-- La página /gastos-fijos muestra el total, cuánto hay que vender para
-- cubrirlos según el margen bruto (~22% con el mix real: ALO cuesta 80% del
-- precio de venta, Adidas/Nike 75%) y el avance de ventas del mes.

create table if not exists gastos_fijos (
  id        uuid primary key default gen_random_uuid(),
  concepto  text not null,
  monto     integer not null check (monto >= 0),
  activo    boolean not null default true,
  creado_en timestamptz not null default now()
);

alter table gastos_fijos enable row level security;

drop policy if exists gastos_fijos_admin on gastos_fijos;
create policy gastos_fijos_admin on gastos_fijos for all
  using (auth_es_admin()) with check (auth_es_admin());

grant select, insert, update, delete on gastos_fijos to authenticated;
revoke all on gastos_fijos from anon;

-- Carga inicial (valores dados por Johan/Ronaldo, 1-ago-2026)
insert into gastos_fijos (concepto, monto) values
  ('Arriendo',           3800000),
  ('Sueldo Johan',       4000000),
  ('Sueldo Ronaldo',     4000000),
  ('Sueldo Ximena',      2000000),
  ('Sueldo Jhon Fredy',  2000000),
  ('Tarjetas Fabio',     1400000),
  ('Cuota Fabio',         700000),
  ('Carro',               900000),
  ('Luz',                 280000),
  ('Agua',                150000),
  ('Internet',            100000),
  ('Aguas clientes',      100000),
  ('Gas',                   3000);
