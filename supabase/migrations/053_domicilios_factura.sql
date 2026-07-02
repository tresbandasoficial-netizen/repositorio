-- Migration 053: Link domicilios to facturas for mensajero balance collection
-- Allows tracking when a mensajero collects an outstanding invoice balance on delivery

ALTER TABLE domicilios ADD COLUMN factura_id uuid REFERENCES facturas(id) ON DELETE SET NULL;
