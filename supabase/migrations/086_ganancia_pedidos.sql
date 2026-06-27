-- Migration 086: Ganancia por pedido (costo vs. venta)
--
-- El negocio define la VENTA al crear el pedido (pedido_items.precio_venta) y el
-- COSTO al subir la factura de compra y asignarla al pedido
-- (compra_items.costo_unitario_cop, ligado por compra_items.pedido_id).
--
-- Esta vista cruza ambos lados para dar venta, costo, utilidad y la bandera
-- tiene_costo por pedido. El costo se toma de dos fuentes (ambas ligadas por
-- pedido_id):
--   * costo_compra: compras asignadas directamente al pedido (flujo principal).
--   * costo_stock : ventas desde inventario (movimiento 'salida'), recalculando
--                   el CPP en vista_costo_promedio (el snapshot del movimiento
--                   hoy viene nulo, por eso se recalcula).
--
-- Supuesto: un ítem se cumple de una sola forma (compra asignada O salida de
-- stock), así que sumar ambas fuentes no genera doble conteo.
-- El % de margen se calcula en la app (evita división por cero).

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
         sum(abs(m.delta) * coalesce(cp.costo_promedio, 0))::int as costo
  from movimientos_inventario m
  left join vista_costo_promedio cp
    on cp.articulo_id = m.articulo_id
   and (cp.talla is not distinct from m.talla)
  where m.tipo = 'salida' and m.pedido_id is not null
  group by m.pedido_id
),
-- Código representativo del artículo del pedido: se prefiere el del pedido y,
-- si no hay, el de la compra asignada. (En pedidos de un solo artículo, que es
-- lo normal, este es exactamente el código de ese artículo.)
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
  coalesce(v.venta, 0)                                              as venta,
  (coalesce(cc.costo, 0) + coalesce(cs.costo, 0))                   as costo,
  (coalesce(v.venta, 0)
     - coalesce(cc.costo, 0)
     - coalesce(cs.costo, 0))                                       as utilidad,
  (cc.pedido_id is not null or cs.pedido_id is not null)            as tiene_costo
from pedidos p
left join venta        v    on v.pedido_id    = p.id
left join costo_compra cc   on cc.pedido_id   = p.id
left join costo_stock  cs   on cs.pedido_id   = p.id
left join codigo_ped   cped on cped.pedido_id = p.id
left join codigo_com   ccom on ccom.pedido_id = p.id
where p.estado != 'cancelado';
