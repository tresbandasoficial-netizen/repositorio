-- Migration 044: Add color, sexo, categoria columns to pedido_items

ALTER TABLE pedido_items
  ADD COLUMN IF NOT EXISTS color text,
  ADD COLUMN IF NOT EXISTS sexo text check (sexo in ('hombre', 'mujer', 'unisex', 'nino', 'nina')),
  ADD COLUMN IF NOT EXISTS categoria text check (categoria in ('tenis', 'ropa', 'accesorio', 'otro'));
