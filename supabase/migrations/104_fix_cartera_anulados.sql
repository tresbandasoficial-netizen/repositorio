-- Migration 104: vista_cartera_clientes debe ignorar los pagos anulados
--
-- Las dos subconsultas de pagos (sobre pedidos y sobre facturas) no filtraban
-- anulado=false, por lo que un pago anulado reducia la deuda del cliente
-- incorrectamente. La vista deuda_por_sede si los filtra, y ambas quedaban
-- descuadradas (~$270.000). Se agrega el filtro anulado=false en ambas
-- subconsultas para que las dos vistas calculen la misma deuda.

create or replace view vista_cartera_clientes as
  select
    c.id,
    c.nombre,
    c.telefono_normalizado,
    c.cedula,
    totales.total_comprado::integer as total_comprado,
    (coalesce(pag_ped.total_pagado, 0) + coalesce(pag_fac.total_pagado, 0))::integer as total_pagado,
    (totales.total_comprado - coalesce(pag_ped.total_pagado, 0) - coalesce(pag_fac.total_pagado, 0))::integer as saldo,
    totales.pedidos_activos::integer as pedidos_activos
  from clientes c
  join (
    select cliente_id, sum(total) as total_comprado, count(*) as pedidos_activos
    from pedidos
    where estado <> 'cancelado'
    group by cliente_id
  ) totales on totales.cliente_id = c.id
  left join (
    select p.cliente_id, sum(pg.monto) as total_pagado
    from pagos pg
    join pedidos p on p.id = pg.pedido_id
    where p.estado <> 'cancelado' and pg.metodo <> 'credito' and pg.anulado = false
    group by p.cliente_id
  ) pag_ped on pag_ped.cliente_id = c.id
  left join (
    select f.cliente_id, sum(pf.monto) as total_pagado
    from pagos_factura pf
    join facturas f on f.id = pf.factura_id
    where f.estado <> 'anulada' and pf.metodo <> 'credito' and pf.anulado = false
    group by f.cliente_id
  ) pag_fac on pag_fac.cliente_id = c.id
  where totales.total_comprado > (coalesce(pag_ped.total_pagado, 0) + coalesce(pag_fac.total_pagado, 0));
