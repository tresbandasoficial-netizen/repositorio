-- Migración 144: cuánto se le compra a cada marca
--
-- Para la tabla de marcas en /compras. Sale de compra_items: la marca escrita en
-- la línea de la compra, y si está vacía la del artículo del catálogo enlazado.
--
-- Se agrupa sin distinguir mayúsculas — ALO / alo / Alo / ALo son la misma — y
-- de cada grupo se muestra la escritura más usada, igual que con los proveedores.
--
-- Sale también el proveedor, para poder cruzar "qué marcas le compro a quién"
-- y para que la tabla respete el filtro de proveedor de la pantalla.

create or replace view vista_compras_por_marca as
with base as (
  select
    -- La marca de la línea manda; la del catálogo es el respaldo.
    nullif(trim(coalesce(ci.marca, '')), '') as marca_escrita,
    a.marca                                  as marca_catalogo,
    c.proveedor,
    ci.cantidad,
    ci.costo_unitario_cop,
    c.fecha,
    c.id as compra_id
  from compra_items ci
  join compras c on c.id = ci.compra_id
  left join articulos a on a.id = ci.articulo_id
),
norm as (
  select
    coalesce(marca_escrita, nullif(trim(coalesce(marca_catalogo, '')), '')) as marca,
    proveedor, cantidad, costo_unitario_cop, fecha, compra_id
  from base
),
etiqueta as (
  -- Escritura más usada de cada marca, para no mostrar cuatro veces la misma.
  select lower(marca) as clave, marca, count(*) as veces,
         row_number() over (partition by lower(marca) order by count(*) desc, marca) as rn
  from norm
  where marca is not null
  group by lower(marca), marca
)
select
  coalesce(e.marca, 'Sin marca')                      as marca,
  n.proveedor,
  count(*)::int                                       as items,
  coalesce(sum(n.cantidad), 0)::int                   as unidades,
  coalesce(sum(n.costo_unitario_cop * n.cantidad), 0)::bigint as invertido,
  count(distinct n.compra_id)::int                    as facturas,
  max(n.fecha)                                        as ultima_compra
from norm n
left join etiqueta e on e.clave = lower(n.marca) and e.rn = 1
group by coalesce(e.marca, 'Sin marca'), n.proveedor;

-- Vista de negocio: solo con sesión (regla de la migración 111).
revoke all on vista_compras_por_marca from anon;
grant select on vista_compras_por_marca to authenticated;
