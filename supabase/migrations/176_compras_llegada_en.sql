-- Migration 176: la mercancía de compra entra al stock cuando LLEGA, no al
-- registrar la compra (pedido de Johan 16-ago: las compras se hacen en USA y
-- el stock mostraba mercancía que aún iba en camino).
-- compras.llegada_en marca cuándo se le dio "Llegó a Bucaramanga"; las
-- entradas de inventario de los items sin pedido se registran en ese momento.
alter table compras add column if not exists llegada_en timestamptz;

-- Las compras existentes ya cargaron su stock al crearse (regla vieja):
-- se les marca la llegada retroactiva para que todo siga funcionando igual
-- y la regla nueva aplique solo a compras nuevas.
update compras set llegada_en = creado_en where llegada_en is null;
