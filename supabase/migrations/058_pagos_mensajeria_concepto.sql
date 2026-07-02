-- Migration 058: Cuenta corriente con la mensajería (recaudos vs domicilios)
--
-- Hasta ahora pagos_mensajeria solo registraba "TB le debe al mensajero"
-- (deudas por domicilios que TB asume). El flujo integrado agrega la
-- dirección opuesta: "el mensajero le debe a TB" (recaudos que cobró).
--
-- Se distingue con `concepto`:
--   recaudo      → el mensajero cobró el pedido y debe traer ese dinero a TB
--   domicilio_tb → TB asumió el domicilio y se lo debe al mensajero
--   liquidacion  → el mensajero entregó el dinero (salda los pendientes)
--   (NULL)       → registros antiguos (deudas/pagos manuales previos)
--
-- `estado` controla la liquidación: pendiente → liquidado.
-- `factura_id` vincula el movimiento con la factura que lo originó.

ALTER TABLE pagos_mensajeria
  ADD COLUMN IF NOT EXISTS factura_id uuid REFERENCES facturas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS concepto text
    CHECK (concepto IN ('recaudo','domicilio_tb','liquidacion')),
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','liquidado'));

-- La vista histórica de deuda (TB → mensajero) debe IGNORAR los recaudos
-- (mensajero → TB) y las liquidaciones, para no mezclar las dos direcciones.
CREATE OR REPLACE VIEW vista_deuda_mensajerias AS
SELECT
  mensajeria,
  SUM(CASE WHEN tipo = 'deuda' AND concepto IS DISTINCT FROM 'recaudo'
           THEN monto ELSE 0 END) AS total_deuda,
  SUM(CASE WHEN tipo = 'pago' AND concepto IS DISTINCT FROM 'liquidacion'
           THEN monto ELSE 0 END) AS total_pagado,
  SUM(CASE WHEN tipo = 'deuda' AND concepto IS DISTINCT FROM 'recaudo' THEN monto
           WHEN tipo = 'pago'  AND concepto IS DISTINCT FROM 'liquidacion' THEN -monto
           ELSE 0 END) AS saldo_pendiente
FROM pagos_mensajeria
GROUP BY mensajeria;
