-- Migration 179: Envíos internacionales (USA) — cuadre con la transportadora
--
-- La cuenta "Davivienda" es de la EMPRESA DE ENVÍOS de USA: lo que los
-- clientes consignan ahí queda A FAVOR de TB con ellos, y ellos descuentan el
-- costo de cada caja que mandan. Este módulo lleva ese cuadre:
--   · Los ingresos entran solos (pagos con método davivienda y consignaciones
--     de las sedes a esa cuenta — la asesora solo ve "consignar a Davivienda").
--   · Cada cobro de envío se registra aquí y sale de la cuenta como traslado
--     SIN DESTINO (egreso externo, mig. 173) — no es gasto operativo: el costo
--     del envío ya va dentro del costo de la mercancía cuando se digita en la
--     compra (reparto de envío/tax del formulario de compras).
-- Solo admin. Corte inicial aplicado por SQL el 21-ago-2026: egreso $5.762.499
-- (envíos cobrados antes de llevar el control) → saldo real $2.138.000.

create table if not exists envios_usa (
  id          uuid primary key default gen_random_uuid(),
  fecha       date not null,
  descripcion text not null,
  valor       integer not null check (valor > 0),
  compra_id   uuid references compras(id),
  traslado_id uuid references traslados_caja(id),
  creado_por  uuid not null references usuarios(id),
  creado_en   timestamptz not null default now()
);

alter table envios_usa enable row level security;

create policy envios_usa_admin on envios_usa for all to authenticated
  using (exists (select 1 from usuarios u where u.id = auth.uid() and u.rol = 'admin'))
  with check (exists (select 1 from usuarios u where u.id = auth.uid() and u.rol = 'admin'));

revoke all on envios_usa from anon;
