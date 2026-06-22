-- Migration 036: cuenta_id en pagos y pagos_factura
--
-- Cada ingreso queda asociado a la cuenta donde entró el dinero.
-- Nullable para compatibilidad con registros históricos.

alter table pagos
  add column if not exists cuenta_id uuid references cuentas(id);

alter table pagos_factura
  add column if not exists cuenta_id uuid references cuentas(id);
