-- Migración 123: número de factura de compra único a nivel de base de datos
-- (candado definitivo anti-duplicados; la app además lo exige obligatorio).
-- Parcial: las compras viejas sin número no bloquean.
create unique index if not exists idx_compras_numero_factura_unico
  on compras (numero_factura)
  where numero_factura is not null and numero_factura <> '';
