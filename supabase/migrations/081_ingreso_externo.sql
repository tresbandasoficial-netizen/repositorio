-- Migration 081: ingresos externos en traslados_caja
--
-- Permite registrar dinero que ENTRA de afuera (no es una venta ni sale de otra
-- cuenta): aporte de capital del dueño, un préstamo, una devolución de proveedor,
-- etc. Se modela como un traslado SIN origen: origen_cuenta_id = NULL, destino =
-- la cuenta que recibe la plata.
--
-- El flujo de caja ya lo maneja: un traslado con origen NULL no descuenta ninguna
-- cuenta (no hay match de egreso) y suma su monto al destino (ingreso).
--
-- El CHECK existente (origen_cuenta_id <> destino_cuenta_id) sigue válido: con
-- origen NULL la comparación da NULL y Postgres lo considera satisfecho.

alter table traslados_caja
  alter column origen_cuenta_id drop not null;
