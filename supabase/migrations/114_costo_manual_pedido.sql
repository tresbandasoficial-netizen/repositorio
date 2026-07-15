-- Migration 114: costo manual del pedido (solo admin)
--
-- Hasta ahora el costo de un pedido solo podía venir de una compra asignada
-- (compra_items.pedido_id) o de una salida de inventario. Para pedidos sin
-- ninguna de las dos (encargos viejos, casos especiales), el admin puede
-- digitar el costo total a mano: pedidos.costo_manual.
--
-- En vista_ganancia_pedidos el costo manual MANDA cuando está definido
-- (reemplaza al calculado); si es null, todo sigue igual que antes.

alter table pedidos add column if not exists costo_manual integer
  check (costo_manual is null or costo_manual >= 0);

create or replace view vista_ganancia_pedidos as
with venta as (
  select pedido_id, sum(precio_venta * cantidad)::int as venta
  from pedido_items
  group by pedido_id
),
costo_compra as (
  select pedido_id, sum(costo_unitario_cop * cantidad)::int as costo
  from compra_items
  where pedido_id is not null
  group by pedido_id
),
costo_stock as (
  select m.pedido_id,
         sum(abs(m.delta) * coalesce(m.costo_unitario_cop, cp.costo_promedio, 0))::int as costo
  from movimientos_inventario m
  left join vista_costo_promedio cp
    on cp.articulo_id = m.articulo_id
   and (cp.talla is not distinct from m.talla)
  where m.tipo = 'salida' and m.pedido_id is not null
  group by m.pedido_id
),
codigo_ped as (
  select pedido_id, min(codigo) filter (where codigo is not null and codigo <> '') as codigo
  from pedido_items group by pedido_id
),
codigo_com as (
  select pedido_id, min(codigo) filter (where codigo is not null and codigo <> '') as codigo
  from compra_items where pedido_id is not null group by pedido_id
)
select
  p.id            as pedido_id,
  p.numero_orden,
  p.tipo,
  p.sede_id,
  p.cliente_id,
  p.estado,
  p.fecha_creacion,
  p.factura_id,
  coalesce(cped.codigo, ccom.codigo)                               as codigo,
  coalesce(v.venta, 0)                                             as venta,
  coalesce(p.costo_manual,
           coalesce(cc.costo, 0) + coalesce(cs.costo, 0))          as costo,
  (coalesce(v.venta, 0)
     - coalesce(p.costo_manual,
                coalesce(cc.costo, 0) + coalesce(cs.costo, 0)))    as utilidad,
  (p.costo_manual is not null
     or (coalesce(cc.costo, 0) + coalesce(cs.costo, 0)) > 0)       as tiene_costo
from pedidos p
left join venta        v    on v.pedido_id    = p.id
left join costo_compra cc   on cc.pedido_id   = p.id
left join costo_stock  cs   on cs.pedido_id   = p.id
left join codigo_ped   cped on cped.pedido_id = p.id
left join codigo_com   ccom on ccom.pedido_id = p.id
where p.estado != 'cancelado';
