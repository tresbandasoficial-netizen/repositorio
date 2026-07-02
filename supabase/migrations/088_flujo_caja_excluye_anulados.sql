-- Migration 088: vista_flujo_caja excluye pagos anulados
--
-- Al poder anular abonos (eliminarAbonoAction), un pago anulado seguía contando
-- en vista_flujo_caja porque la rama de `pagos` no filtraba pg.anulado. Se
-- agrega el filtro en ambas ramas (pagos y pagos_factura) para que un abono
-- eliminado desaparezca también de los ingresos del flujo de caja.

CREATE OR REPLACE VIEW vista_flujo_caja AS
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
  SELECT x.cuenta_id, SUM(x.monto) AS total
  FROM (
    SELECT pg.cuenta_id, pg.monto
    FROM pagos pg
    JOIN pedidos p ON p.id = pg.pedido_id
    WHERE pg.cuenta_id IS NOT NULL
      AND pg.metodo   != 'credito'
      AND pg.anulado  = false
      AND p.estado    != 'cancelado'
    UNION ALL
    SELECT pf.cuenta_id, pf.monto
    FROM pagos_factura pf
    JOIN facturas f ON f.id = pf.factura_id
    WHERE pf.cuenta_id IS NOT NULL
      AND pf.metodo   != 'credito'
      AND pf.anulado  = false
      AND f.estado    != 'anulada'
  ) x
  GROUP BY x.cuenta_id
) i ON i.cuenta_id = c.id
LEFT JOIN (
  SELECT cuenta_id, SUM(valor) AS total
  FROM gastos
  WHERE cuenta_id IS NOT NULL
  GROUP BY cuenta_id
) e ON e.cuenta_id = c.id
WHERE c.activa = true
ORDER BY c.orden;
