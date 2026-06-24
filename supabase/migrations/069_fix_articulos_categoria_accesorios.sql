-- Migration 069: Asegurar que 'accesorios' esté en el check constraint de articulos
--
-- El constraint articulos_categoria_check en la BD puede haber quedado con solo
-- ('ropa', 'tenis') si fue aplicado antes de que se añadiera 'accesorios'.
-- Esto causa error al facturar productos de categoría 'accesorios'.
-- Solución: recrear el constraint con los tres valores correctos.
--
-- También se verifica pedido_items por la misma razón.

ALTER TABLE articulos
  DROP CONSTRAINT IF EXISTS articulos_categoria_check;

ALTER TABLE articulos
  ADD CONSTRAINT articulos_categoria_check
  CHECK (categoria IN ('ropa', 'tenis', 'accesorios'));

ALTER TABLE pedido_items
  DROP CONSTRAINT IF EXISTS pedido_items_categoria_check;

ALTER TABLE pedido_items
  ADD CONSTRAINT pedido_items_categoria_check
  CHECK (categoria IN ('ropa', 'tenis', 'accesorios'));
