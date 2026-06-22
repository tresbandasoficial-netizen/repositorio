-- Migration 051: allow 'cuenta' as payment method in pagos and pagos_factura
ALTER TABLE pagos DROP CONSTRAINT IF EXISTS pagos_metodo_check;
ALTER TABLE pagos ADD CONSTRAINT pagos_metodo_check
  CHECK (metodo IN ('efectivo','transferencia','tarjeta','nequi','credito','cuenta'));

ALTER TABLE pagos_factura DROP CONSTRAINT IF EXISTS pagos_factura_metodo_check;
ALTER TABLE pagos_factura ADD CONSTRAINT pagos_factura_metodo_check
  CHECK (metodo IN ('efectivo','transferencia','tarjeta','nequi','credito','cuenta'));
