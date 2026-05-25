-- Migration 015: item index within pedido for compra_items
-- Allows TR1025-1, TR1025-2 notation to identify which pedido item
-- this compra item corresponds to.

ALTER TABLE compra_items ADD COLUMN IF NOT EXISTS pedido_item_indice smallint;
