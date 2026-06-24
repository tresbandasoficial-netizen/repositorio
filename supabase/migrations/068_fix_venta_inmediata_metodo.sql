-- Migration 068: Dos correcciones financieras
--
-- 1. registrar_venta_inmediata: el abono se grababa con metodo='cuenta' fijo.
--    Eso rompía el desglose por método del cuadre (todo aparecía como "cuenta"
--    en vez del método real: efectivo, bold, nequi, etc.) y hacía desaparecer
--    el monto de las estadísticas por método.
--    Solución: añadir parámetro p_metodo (default 'efectivo') y usarlo.
--
-- 2. vista_flujo_caja: la rama de `pagos` (abonos a pedidos directos) no
--    excluía pedidos cancelados, mientras que la rama de `pagos_factura` sí
--    excluía facturas anuladas. Inconsistencia con el cuadre.
--    Solución: JOIN pedidos y filtrar estado != 'cancelado'.

CREATE OR REPLACE FUNCTION registrar_venta_inmediata(
  p_numero_orden text,
  p_sede_id      uuid,
  p_asesor_id    uuid,
  p_cliente_id   uuid,
  p_total        integer,
  p_items        jsonb,
  p_abono        integer,
  p_cuenta_id    uuid    DEFAULT NULL,
  p_notas        text    DEFAULT NULL,
  p_metodo       text    DEFAULT 'efectivo'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pedido_id uuid;
  v_item      jsonb;
  v_cantidad  integer;
  v_articulo  uuid;
  v_talla     text;
  v_costo     numeric;
BEGIN
  INSERT INTO pedidos (numero_orden, sede_id, asesor_id, cliente_id, total, tipo_entrega, estado, tipo, notas)
  VALUES (p_numero_orden, p_sede_id, p_asesor_id, p_cliente_id, p_total, 'sede', 'entregado', 'venta_inmediata', p_notas)
  RETURNING id INTO v_pedido_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_cantidad := (v_item->>'cantidad')::integer;
    v_articulo := nullif(v_item->>'articulo_id', '')::uuid;
    v_talla    := nullif(v_item->>'talla', '');

    INSERT INTO pedido_items (pedido_id, articulo_id, marca, descripcion, talla, cantidad, precio_venta)
    VALUES (
      v_pedido_id,
      v_articulo,
      v_item->>'marca',
      v_item->>'descripcion',
      v_talla,
      v_cantidad,
      (v_item->>'precio_venta')::integer
    );

    IF v_articulo IS NOT NULL THEN
      SELECT costo_promedio INTO v_costo
      FROM vista_costo_promedio
      WHERE articulo_id = v_articulo AND (talla IS NOT DISTINCT FROM v_talla);

      INSERT INTO movimientos_inventario (
        articulo_id, talla, sede_id, delta, tipo, pedido_id, costo_unitario_cop, usuario_id
      )
      VALUES (
        v_articulo, v_talla, p_sede_id, -v_cantidad, 'salida', v_pedido_id, v_costo, p_asesor_id
      );
    END IF;
  END LOOP;

  IF p_abono > 0 THEN
    INSERT INTO pagos (pedido_id, monto, metodo, cuenta_id, asesor_id)
    VALUES (v_pedido_id, p_abono, p_metodo, p_cuenta_id, p_asesor_id);
  END IF;

  INSERT INTO historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id)
  VALUES ('pedidos', v_pedido_id, 'estado', null, 'entregado', p_asesor_id);

  RETURN v_pedido_id;
END;
$$;

-- ── vista_flujo_caja: excluir pagos de pedidos cancelados ────────────────────
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
  SELECT x.cuenta_id, SUM(x.monto) AS total
  FROM (
    SELECT pg.cuenta_id, pg.monto
    FROM pagos pg
    JOIN pedidos p ON p.id = pg.pedido_id
    WHERE pg.cuenta_id IS NOT NULL
      AND pg.metodo   != 'credito'
      AND p.estado    != 'cancelado'
    UNION ALL
    SELECT pf.cuenta_id, pf.monto
    FROM pagos_factura pf
    JOIN facturas f ON f.id = pf.factura_id
    WHERE pf.cuenta_id IS NOT NULL
      AND pf.metodo   != 'credito'
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
