-- Migration 066: Corregir anular_factura y vista_flujo_caja
--
-- Problemas:
-- 1. anular_factura solo desvinculaba pedidos y marcaba la factura como anulada,
--    pero dejaba huérfanos: gastos automáticos (domicilio/envío), deudas con
--    mensajería y domicilios pendientes de entrega. Esos registros fantasma
--    distorsionaban gastos, deuda con mensajería y cuadre de domicilios.
--
-- 2. vista_flujo_caja incluía pagos_factura de facturas anuladas, inflando
--    los ingresos por cuenta.
--
-- Solución 1: reescribir anular_factura para limpiar los registros derivados
--   (en este orden para respetar FKs):
--   a) Eliminar pagos_mensajeria pendientes generados por esta factura
--   b) Eliminar domicilios pendientes vinculados a esta factura
--   c) Eliminar gastos automáticos (origen domicilio/envío) de esta factura
--   d) Desvincular pedidos (existente)
--   e) Marcar factura como anulada (existente)
--
-- Solución 2: filtrar pagos_factura de facturas anuladas en vista_flujo_caja.

CREATE OR REPLACE FUNCTION anular_factura(p_factura_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- a) Pagos con mensajería pendientes (recaudos y deudas domicilio)
  --    generados automáticamente al crear la factura
  DELETE FROM pagos_mensajeria
  WHERE factura_id = p_factura_id
    AND estado = 'pendiente';

  -- b) Domicilios pendientes creados automáticamente al facturar
  DELETE FROM domicilios
  WHERE factura_id = p_factura_id
    AND estado = 'pendiente';

  -- c) Gastos automáticos de domicilio o envío ligados a esta factura
  DELETE FROM gastos
  WHERE origen_id = p_factura_id
    AND origen IN ('domicilio', 'envio');

  -- d) Desvincular pedidos (siguen existiendo, vuelven a cartera libre)
  UPDATE pedidos SET factura_id = NULL WHERE factura_id = p_factura_id;

  -- e) Marcar factura como anulada
  UPDATE facturas
  SET estado = 'anulada', actualizado_en = now()
  WHERE id = p_factura_id;
END;
$$;

-- ── Corregir vista_flujo_caja: excluir pagos de facturas anuladas ────────────
-- DROP primero porque Postgres no permite renombrar columnas con CREATE OR REPLACE VIEW.

DROP VIEW IF EXISTS vista_flujo_caja;

CREATE VIEW vista_flujo_caja AS
SELECT
  c.id              AS cuenta_id,
  c.nombre          AS cuenta,
  c.tipo,
  c.sede_id,
  s.codigo          AS sede_codigo,
  c.orden,
  coalesce(i.total, 0)                            AS ingresos,
  coalesce(e.total, 0)                            AS egresos,
  coalesce(i.total, 0) - coalesce(e.total, 0)     AS neto
FROM cuentas c
LEFT JOIN sedes s ON s.id = c.sede_id
LEFT JOIN (
  SELECT cuenta_id, SUM(monto) AS total
  FROM (
    SELECT cuenta_id, monto
    FROM pagos
    WHERE cuenta_id IS NOT NULL AND metodo != 'credito'
    UNION ALL
    SELECT pf.cuenta_id, pf.monto
    FROM pagos_factura pf
    JOIN facturas f ON f.id = pf.factura_id
    WHERE pf.cuenta_id IS NOT NULL
      AND pf.metodo   != 'credito'
      AND f.estado    != 'anulada'
  ) x
  GROUP BY cuenta_id
) i ON i.cuenta_id = c.id
LEFT JOIN (
  SELECT cuenta_id, SUM(valor) AS total
  FROM gastos
  WHERE cuenta_id IS NOT NULL
  GROUP BY cuenta_id
) e ON e.cuenta_id = c.id
WHERE c.activa = true
ORDER BY c.orden;
