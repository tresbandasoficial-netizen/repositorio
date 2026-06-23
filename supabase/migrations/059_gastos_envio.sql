-- Migration 059: Categoría y origen 'envio' en gastos
--
-- Permite registrar gastos de envíos (empresas de paquetería) y rastrear
-- los gastos generados automáticamente desde una factura (origen='envio').

ALTER TABLE gastos DROP CONSTRAINT IF EXISTS gastos_categoria_check;
ALTER TABLE gastos ADD CONSTRAINT gastos_categoria_check
  CHECK (categoria IN (
    'compras_mercancia','domicilios','envio','publicidad','nomina',
    'arriendo','servicios','transporte','papeleria','otros'
  ));

ALTER TABLE gastos DROP CONSTRAINT IF EXISTS gastos_origen_check;
ALTER TABLE gastos ADD CONSTRAINT gastos_origen_check
  CHECK (origen IN ('manual','compra','domicilio','envio'));
