-- Migration 057: Domicilios generados desde factura
--
-- valor_a_cobrar → monto exacto que el mensajero le cobra al cliente
--                  (recaudo + domicilio si el cliente paga el domicilio).
-- origen         → 'manual' (registro directo) | 'factura' (auto desde facturación).
--
-- La dirección pasa a ser opcional: al facturar puede no haber dirección
-- guardada del cliente; el asesor la completa después en Domicilios.

ALTER TABLE domicilios
  ADD COLUMN IF NOT EXISTS valor_a_cobrar integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'manual'
    CHECK (origen IN ('manual','factura'));

ALTER TABLE domicilios ALTER COLUMN direccion DROP NOT NULL;
