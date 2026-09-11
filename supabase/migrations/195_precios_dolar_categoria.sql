-- Precios dólar: cada artículo lleva categoría porque la ganancia cambia:
--   zapatos: +$250.000 si el costo en pesos (con tax) no pasa de $1.000.000;
--            +30% si pasa del millón.
--   prendas (camisas y demás): +40%.
-- El tax del 7% y la TRM aplican igual para todos (fórmula en lib/utils).
alter table public.precios_dolar
  add column categoria text not null default 'prendas'
  check (categoria in ('zapatos', 'prendas'));
