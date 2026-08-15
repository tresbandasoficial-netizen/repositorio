-- Centinela de la cartera: seis chequeos que antes solo se descubrían de
-- casualidad revisando un cliente a mano. Todos deben devolver cero filas; si
-- alguno aparece, hay plata mal registrada y la deuda de ese cliente miente.
--
-- Nace de dos casos reales (ago-2026): un pago cobrado dos veces sobre un pedido
-- ya facturado (Karen Álvarez) y un pago registrado en el pedido en vez de en la
-- factura, que dejó la factura "pendiente" aunque estaba paga (Laura Benavides).
-- La migración 167 tapó la causa; esta vista avisa si vuelve a pasar por otra vía.
create or replace view public.vista_descuadres_cartera as

-- 1. Grupo de factura sobrepagado: lo pagado (directo + factura) supera el total
--    de los pedidos que agrupa. Es el síntoma del cobro doble.
with grupos as (
  select f.id as factura_id, f.numero_factura, f.cliente_id,
    (select coalesce(sum(p.total), 0) from pedidos p
      where p.factura_id = f.id and p.estado <> 'cancelado') as total_pedidos,
    (select string_agg(p.numero_orden, ', ' order by p.numero_orden) from pedidos p
      where p.factura_id = f.id and p.estado <> 'cancelado') as pedidos,
    coalesce((select sum(pf.monto) from pagos_factura pf
      where pf.factura_id = f.id and pf.anulado = false and pf.metodo <> 'credito'), 0) as pago_factura,
    coalesce((select sum(pg.monto) from pagos pg join pedidos p on p.id = pg.pedido_id
      where p.factura_id = f.id and p.estado <> 'cancelado'
        and pg.anulado = false and pg.metodo <> 'credito'), 0) as pago_directo
  from facturas f
  where f.estado <> 'anulada'
)
select 'factura_sobrepagada' as tipo,
       'El cliente pagó más de lo que suman los pedidos de esta factura' as descripcion,
       g.cliente_id, c.nombre as cliente, g.numero_factura as referencia,
       g.pedidos as detalle,
       (g.pago_directo + g.pago_factura) - g.total_pedidos as monto
from grupos g left join clientes c on c.id = g.cliente_id
where g.total_pedidos > 0 and (g.pago_directo + g.pago_factura) > g.total_pedidos

union all

-- 2. Pedido sin factura con más pagos que su total.
select 'pedido_sobrepagado',
       'Pedido sin factura con más abonos que su total',
       p.cliente_id, c.nombre, p.numero_orden, null,
       coalesce((select sum(pg.monto) from pagos pg
         where pg.pedido_id = p.id and pg.anulado = false and pg.metodo <> 'credito'), 0) - p.total
from pedidos p left join clientes c on c.id = p.cliente_id
where p.factura_id is null and p.estado <> 'cancelado'
  and coalesce((select sum(pg.monto) from pagos pg
    where pg.pedido_id = p.id and pg.anulado = false and pg.metodo <> 'credito'), 0) > p.total

union all

-- 3. Factura con pagos pero sin ningún pedido detrás: esos pagos le bajan la
--    deuda al cliente sin que nunca se le haya sumado la compra.
select 'factura_sin_pedido',
       'Factura con pagos pero sin pedidos vinculados: baja la deuda sin compra',
       f.cliente_id, c.nombre, f.numero_factura, null,
       coalesce((select sum(pf.monto) from pagos_factura pf
         where pf.factura_id = f.id and pf.anulado = false and pf.metodo <> 'credito'), 0)
from facturas f left join clientes c on c.id = f.cliente_id
where f.estado <> 'anulada'
  and not exists (select 1 from pedidos p where p.factura_id = f.id and p.estado <> 'cancelado')
  and coalesce((select sum(pf.monto) from pagos_factura pf
    where pf.factura_id = f.id and pf.anulado = false and pf.metodo <> 'credito'), 0) > 0

union all

-- 4. Factura a nombre de un cliente distinto al del pedido: el pago le rebaja la
--    deuda a quien no es.
select distinct 'factura_cliente_distinto',
       'La factura está a nombre de un cliente distinto al del pedido',
       p.cliente_id, cp.nombre, f.numero_factura,
       p.numero_orden || ' es de ' || coalesce(cp.nombre, '?') || ', la factura de ' || coalesce(cf.nombre, '?'),
       f.total
from facturas f
join pedidos p on p.factura_id = f.id and p.estado <> 'cancelado'
left join clientes cf on cf.id = f.cliente_id
left join clientes cp on cp.id = p.cliente_id
where f.estado <> 'anulada' and f.cliente_id is distinct from p.cliente_id

union all

-- 5. Factura pendiente que en realidad ya está paga, porque el pago se registró
--    en el pedido. El cliente aparece debiendo algo que ya pagó (caso Laura).
select 'factura_pendiente_ya_pagada',
       'Factura pendiente cuyo pago se registró en el pedido: se le puede cobrar dos veces',
       f.cliente_id, c.nombre, f.numero_factura, null,
       f.total - coalesce((select sum(pf.monto) from pagos_factura pf
         where pf.factura_id = f.id and pf.anulado = false and pf.metodo <> 'credito'), 0)
from facturas f left join clientes c on c.id = f.cliente_id
where f.estado in ('pendiente', 'vencida')
  and coalesce((select sum(pf.monto) from pagos_factura pf
    where pf.factura_id = f.id and pf.anulado = false and pf.metodo <> 'credito'), 0) < f.total
  and coalesce((select sum(pg.monto) from pagos pg join pedidos p on p.id = pg.pedido_id
    where p.factura_id = f.id and pg.anulado = false and pg.metodo <> 'credito'
      and pg.creado_en > f.creado_en), 0) > 0

union all

-- 6. Centinela de la 167: pago directo sobre un pedido que ya estaba facturado.
--    Desde la 167 el RPC lo enruta a la factura, así que esto solo puede volver
--    a aparecer por un INSERT manual o por un camino nuevo que se nos escape.
select 'pago_directo_en_pedido_facturado',
       'Pago registrado en el pedido después de emitir su factura',
       p.cliente_id, c.nombre, p.numero_orden, f.numero_factura, pg.monto
from pagos pg
join pedidos p on p.id = pg.pedido_id
join facturas f on f.id = p.factura_id
left join clientes c on c.id = p.cliente_id
where pg.anulado = false and pg.metodo <> 'credito'
  and f.estado <> 'anulada' and pg.creado_en > f.creado_en;

comment on view public.vista_descuadres_cartera is
  'Descuadres de cartera que hacen mentir la deuda de un cliente. Lo normal es cero filas.';

grant select on public.vista_descuadres_cartera to authenticated;
