-- Migration 105: cartera por cliente Y sede (para poder filtrar cartera por sede)
--
-- vista_cartera_clientes agrupa la deuda por cliente sin distinguir sede. Esta
-- vista la calcula por (cliente, sede), con la misma logica de deuda que
-- vista_cartera_clientes y deuda_por_sede: base = total de pedidos (no
-- cancelados), menos pagos de pedidos y de facturas validos (no credito, no
-- anulados). Como una factura agrupa pedidos de una sola sede, los pagos de
-- factura se atribuyen limpiamente a la sede de la factura.

create or replace view vista_cartera_cliente_sede as
  select
    totales.cliente_id            as id,
    c.nombre,
    c.telefono_normalizado,
    c.cedula,
    s.id                          as sede_id,
    s.codigo                      as sede_codigo,
    s.nombre                      as sede_nombre,
    totales.total_comprado::integer as total_comprado,
    (coalesce(pag_ped.total_pagado, 0) + coalesce(pag_fac.total_pagado, 0))::integer as total_pagado,
    (totales.total_comprado - coalesce(pag_ped.total_pagado, 0) - coalesce(pag_fac.total_pagado, 0))::integer as saldo,
    totales.pedidos_activos::integer as pedidos_activos
  from (
    select cliente_id, sede_id, sum(total) as total_comprado, count(*) as pedidos_activos
    from pedidos
    where estado <> 'cancelado'
    group by cliente_id, sede_id
  ) totales
  join clientes c on c.id = totales.cliente_id
  join sedes    s on s.id = totales.sede_id
  left join (
    select p.cliente_id, p.sede_id, sum(pg.monto) as total_pagado
    from pagos pg
    join pedidos p on p.id = pg.pedido_id
    where p.estado <> 'cancelado' and pg.metodo <> 'credito' and pg.anulado = false
    group by p.cliente_id, p.sede_id
  ) pag_ped on pag_ped.cliente_id = totales.cliente_id and pag_ped.sede_id = totales.sede_id
  left join (
    select f.cliente_id, f.sede_id, sum(pf.monto) as total_pagado
    from pagos_factura pf
    join facturas f on f.id = pf.factura_id
    where f.estado <> 'anulada' and pf.metodo <> 'credito' and pf.anulado = false
    group by f.cliente_id, f.sede_id
  ) pag_fac on pag_fac.cliente_id = totales.cliente_id and pag_fac.sede_id = totales.sede_id
  where totales.total_comprado > (coalesce(pag_ped.total_pagado, 0) + coalesce(pag_fac.total_pagado, 0));
