-- Migration 033: Código de producto en compra_items
--
-- Almacena el código SKU extraído de la factura del proveedor.
-- Permite vincular automáticamente el compra_item con el artículo del catálogo
-- al momento de asignar el pedido, sin pasos manuales adicionales.

alter table compra_items
  add column if not exists codigo text;

comment on column compra_items.codigo is
  'Código SKU del producto tal como aparece en la factura del proveedor. Usado para auto-vincular con articulos.codigo al asignar pedido.';
