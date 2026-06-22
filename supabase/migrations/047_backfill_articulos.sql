-- Migration 047: Backfill articulos from existing pedido_items
-- Toma todos los productos vendidos históricamente y los registra en el catálogo.

insert into articulos (nombre, marca, color, sexo, categoria, activo)
select distinct
  descripcion                 as nombre,
  marca,
  nullif(trim(color), '')     as color,
  nullif(trim(sexo), '')      as sexo,
  nullif(trim(categoria), '') as categoria,
  true
from pedido_items
where articulo_id is null
  and descripcion is not null and trim(descripcion) <> ''
  and marca       is not null and trim(marca)       <> ''
on conflict (lower(marca), lower(nombre), lower(coalesce(color, '')), lower(coalesce(sexo, '')))
do update set
  categoria = coalesce(excluded.categoria, articulos.categoria);

-- Vincular los pedido_items al articulo recién creado
update pedido_items pi
set    articulo_id = a.id
from   articulos a
where  pi.articulo_id is null
  and  lower(pi.marca)               = lower(a.marca)
  and  lower(pi.descripcion)         = lower(a.nombre)
  and  lower(coalesce(pi.color, '')) = lower(coalesce(a.color, ''))
  and  lower(coalesce(pi.sexo, ''))  = lower(coalesce(a.sexo, ''));
