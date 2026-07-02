-- Migration 065: Corregir vista_cartera_clientes para incluir pagos_factura
--
-- Problema: la vista solo sumaba `pagos` (abonos a pedidos) pero ignoraba
-- `pagos_factura` (abonos a facturas). Después de facturar un pedido, todos
-- los nuevos abonos van a `pagos_factura`, por lo que el saldo nunca bajaba
-- y clientes que ya habían pagado seguían apareciendo como deudores.
--
-- Solución: incluir un subquery que sume pagos_factura por cliente, excluyendo
-- las facturas anuladas.

CREATE OR REPLACE VIEW vista_cartera_clientes AS
SELECT
  c.id,
  c.nombre,
  c.telefono_normalizado,
  c.cedula,
  totales.total_comprado::integer                                                          AS total_comprado,
  (coalesce(pag_ped.total_pagado, 0) + coalesce(pag_fac.total_pagado, 0))::integer        AS total_pagado,
  (totales.total_comprado
    - coalesce(pag_ped.total_pagado, 0)
    - coalesce(pag_fac.total_pagado, 0))::integer                                          AS saldo,
  totales.pedidos_activos::integer                                                          AS pedidos_activos
FROM clientes c
JOIN (
  SELECT
    cliente_id,
    SUM(total)  AS total_comprado,
    COUNT(*)    AS pedidos_activos
  FROM pedidos
  WHERE estado != 'cancelado'
  GROUP BY cliente_id
) totales ON totales.cliente_id = c.id
LEFT JOIN (
  -- Abonos previos a facturar (tabla pagos, ligados al pedido)
  SELECT
    p.cliente_id,
    SUM(pg.monto) AS total_pagado
  FROM pagos pg
  JOIN pedidos p ON p.id = pg.pedido_id
  WHERE p.estado != 'cancelado'
  GROUP BY p.cliente_id
) pag_ped ON pag_ped.cliente_id = c.id
LEFT JOIN (
  -- Abonos post-factura (tabla pagos_factura, ligados a la factura)
  SELECT
    f.cliente_id,
    SUM(pf.monto) AS total_pagado
  FROM pagos_factura pf
  JOIN facturas f ON f.id = pf.factura_id
  WHERE f.estado != 'anulada'
  GROUP BY f.cliente_id
) pag_fac ON pag_fac.cliente_id = c.id
WHERE totales.total_comprado
        > coalesce(pag_ped.total_pagado, 0) + coalesce(pag_fac.total_pagado, 0);
