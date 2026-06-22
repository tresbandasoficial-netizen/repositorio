-- Migration 054: corregir doble conteo entre cartera y facturas
--
-- Problema: vista_cartera_clientes contaba TODOS los pedidos (incluso los ya
-- facturados). Un pedido facturado aparecía a la vez en cartera Y en facturas,
-- inflando la deuda. Además, una vez pagada la factura, cartera seguía
-- mostrando un saldo que ya no existía.
--
-- Solución: la cartera solo cuenta pedidos NO facturados (factura_id is null).
-- Cuando un pedido se factura, su deuda pasa a vivir únicamente en `facturas`
-- (la factura ya nace con los abonos históricos descontados de su total, así
-- que esos abonos siguen reduciendo la deuda del cliente, sin doble conteo).
--
-- Fuente única de verdad:
--   pedido sin factura  -> deuda vive en cartera
--   pedido facturado    -> deuda vive en facturas / morosos

create or replace view vista_cartera_clientes as
select
  c.id,
  c.nombre,
  c.telefono_normalizado,
  c.cedula,
  totales.total_comprado::integer  as total_comprado,
  coalesce(pagados.total_pagado, 0)::integer as total_pagado,
  (totales.total_comprado - coalesce(pagados.total_pagado, 0))::integer as saldo,
  totales.pedidos_activos::integer as pedidos_activos
from clientes c
join (
  select
    cliente_id,
    sum(total)  as total_comprado,
    count(*)    as pedidos_activos
  from pedidos
  where estado != 'cancelado'
    and factura_id is null            -- solo pedidos aún no facturados
  group by cliente_id
) totales on totales.cliente_id = c.id
left join (
  select
    p.cliente_id,
    sum(pg.monto) as total_pagado
  from pagos pg
  join pedidos p on p.id = pg.pedido_id
  where p.estado != 'cancelado'
    and p.factura_id is null          -- abonos de pedidos no facturados
  group by p.cliente_id
) pagados on pagados.cliente_id = c.id
where totales.total_comprado > coalesce(pagados.total_pagado, 0);
