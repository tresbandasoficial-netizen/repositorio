-- Migration 096: la identidad de un artículo es su código SKU
--
-- El índice único por marca+nombre+color+sexo impedía crear productos
-- DISTINTOS (códigos diferentes) que comparten nombre comercial. Ahora:
--   · artículos CON código: únicos por código (índice articulos_codigo_idx,
--     ya existente) — pueden repetir marca/nombre/color/sexo.
--   · artículos SIN código: se mantiene la regla por nombre para evitar
--     duplicados accidentales.

drop index if exists articulos_unico;

create unique index articulos_unico on public.articulos
  (lower(marca), lower(nombre), lower(coalesce(color, '')), lower(coalesce(sexo, '')))
  where codigo is null;
