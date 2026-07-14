-- Migration 110: precio de venta del artículo en el catálogo
-- Se llena desde la planilla de carga de inventario (y editable a futuro).
-- Es informativo/base: el precio real de cada venta sigue en pedido_items.

alter table articulos add column if not exists precio_venta integer;
