-- Migration 072: Bloquear visor en todas las políticas de escritura
--
-- Problema: el rol 'visor' es de solo lectura pero las políticas RLS de
-- INSERT/UPDATE/DELETE usaban `auth.role() = 'authenticated'` o
-- `auth.uid() is not null`, que incluyen al visor.
--
-- Solución:
--   1. Función auth_no_es_visor() — true si el usuario es admin o asesor.
--   2. Reemplazar todas las políticas de escritura para usar esa función.
--
-- Tablas afectadas:
--   clientes, pedidos, pedido_items, pagos, historial_cambios,
--   domicilios, cuadres_domicilios, gastos, pagos_mensajeria,
--   facturas, pagos_factura, articulos

-- ── 1. Helper ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.auth_no_es_visor()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM usuarios
    WHERE id = auth.uid() AND rol IN ('admin', 'asesor')
  );
$$;

-- ── 2. clientes ───────────────────────────────────────────────────────────────
-- Antes: FOR ALL using (auth.role() = 'authenticated') → visor puede escribir.
-- Ahora: SELECT libre para autenticados; escritura solo para no-visor.

DROP POLICY IF EXISTS "clientes_all" ON clientes;

CREATE POLICY "clientes_select" ON clientes
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "clientes_insert" ON clientes
  FOR INSERT WITH CHECK (auth_no_es_visor());

CREATE POLICY "clientes_update" ON clientes
  FOR UPDATE USING (auth_no_es_visor());

CREATE POLICY "clientes_delete" ON clientes
  FOR DELETE USING (auth_no_es_visor());

-- ── 3. pedidos ────────────────────────────────────────────────────────────────
-- pedidos_insert viene de 007 (sede check sin visor check).
-- pedidos_update fue abierto en 012 a todo autenticado.

DROP POLICY IF EXISTS "pedidos_insert" ON pedidos;
CREATE POLICY "pedidos_insert" ON pedidos
  FOR INSERT WITH CHECK (
    auth_es_admin()
    OR (auth_no_es_visor() AND sede_id = auth_sede_id())
  );

DROP POLICY IF EXISTS "pedidos_update" ON pedidos;
CREATE POLICY "pedidos_update" ON pedidos
  FOR UPDATE USING (
    auth_es_admin()
    OR (auth_no_es_visor() AND sede_id = auth_sede_id())
  );

-- ── 4. pedido_items ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "pedido_items_insert" ON pedido_items;
CREATE POLICY "pedido_items_insert" ON pedido_items
  FOR INSERT WITH CHECK (
    auth_no_es_visor()
    AND EXISTS (
      SELECT 1 FROM pedidos p
      WHERE p.id = pedido_id
        AND (auth_es_admin() OR p.sede_id = auth_sede_id())
    )
  );

-- ── 5. pagos ──────────────────────────────────────────────────────────────────
-- 012 abrió pagos_insert a todo autenticado.

DROP POLICY IF EXISTS "pagos_insert" ON pagos;
CREATE POLICY "pagos_insert" ON pagos
  FOR INSERT WITH CHECK (
    auth_no_es_visor()
    AND EXISTS (
      SELECT 1 FROM pedidos p
      WHERE p.id = pedido_id
        AND (auth_es_admin() OR p.sede_id = auth_sede_id())
    )
  );

-- ── 6. historial_cambios ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS "historial_insert" ON historial_cambios;
CREATE POLICY "historial_insert" ON historial_cambios
  FOR INSERT WITH CHECK (auth_no_es_visor());

-- ── 7. domicilios ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "domicilios_insert" ON domicilios;
CREATE POLICY "domicilios_insert" ON domicilios
  FOR INSERT WITH CHECK (auth_no_es_visor());

DROP POLICY IF EXISTS "domicilios_update" ON domicilios;
CREATE POLICY "domicilios_update" ON domicilios
  FOR UPDATE USING (auth_no_es_visor());

-- ── 8. cuadres_domicilios ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "cuadres_insert" ON cuadres_domicilios;
CREATE POLICY "cuadres_insert" ON cuadres_domicilios
  FOR INSERT WITH CHECK (auth_no_es_visor());

-- ── 9. gastos ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "gastos_insert" ON gastos;
CREATE POLICY "gastos_insert" ON gastos
  FOR INSERT WITH CHECK (auth_no_es_visor());

-- ── 10. pagos_mensajeria ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS "pm_insert" ON pagos_mensajeria;
CREATE POLICY "pm_insert" ON pagos_mensajeria
  FOR INSERT WITH CHECK (auth_no_es_visor());

-- ── 11. facturas ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "facturas_insert" ON facturas;
CREATE POLICY "facturas_insert" ON facturas
  FOR INSERT WITH CHECK (
    auth_es_admin()
    OR (auth_no_es_visor() AND sede_id = auth_sede_id())
  );

DROP POLICY IF EXISTS "facturas_update" ON facturas;
CREATE POLICY "facturas_update" ON facturas
  FOR UPDATE USING (
    auth_es_admin()
    OR (auth_no_es_visor() AND sede_id = auth_sede_id())
  );

-- ── 12. pagos_factura ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "pagos_factura_insert" ON pagos_factura;
CREATE POLICY "pagos_factura_insert" ON pagos_factura
  FOR INSERT WITH CHECK (
    auth_no_es_visor()
    AND EXISTS (
      SELECT 1 FROM facturas f
      WHERE f.id = factura_id
        AND (auth_es_admin() OR f.sede_id = auth_sede_id())
    )
  );

-- ── 13. articulos ─────────────────────────────────────────────────────────────
-- 052 abrió inserción a todo autenticado para que asesores puedan crear artículos.
-- Mantenemos esa capacidad pero bloqueamos al visor.

DROP POLICY IF EXISTS "autenticados pueden insertar articulos" ON articulos;
CREATE POLICY "articulos_insert" ON articulos
  FOR INSERT WITH CHECK (auth_no_es_visor());
