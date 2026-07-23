-- Migración 124: la cartera separa la deuda en DOS bolsillos por cliente:
--   · saldo_entregado: pedidos ya ENTREGADOS o FACTURADOS (lo facturado se
--     factura porque se entrega) — deuda real por cobrar.
--   · saldo_proceso: pedidos aún sin facturar/entregar — mercancía en camino.
-- Los abonos de cada pedido van a su bolsillo; los abonos de facturas van al
-- bolsillo de entregado (las facturas solo existen para lo entregado). Si un
-- bolsillo queda sobre-pagado, el exceso se corre al otro para que la suma
-- siempre dé el saldo total (misma cifra de siempre).
-- (Definición completa aplicada vía MCP — ver el historial de migraciones en
--  Supabase; recrea vista_cartera_cliente_sede y vista_cartera_clientes con
--  las columnas nuevas saldo_entregado, saldo_proceso, pedidos_entregados y
--  pedidos_proceso, y revoca anon.)

create or replace view vista_cartera_cliente_sede as
select
  t.cliente_id as id,
  c.nombre,
  c.telefono_normalizado,
  c.cedula,
  s.id as sede_id,
  s.codigo as sede_codigo,
  s.nombre as sede_nombre,
  t.total_comprado::integer as total_comprado,
  (coalesce(pp.total_pagado, 0) + coalesce(pf.total_pagado, 0))::integer as total_pagado,
  (t.total_comprado - coalesce(pp.total_pagado, 0) - coalesce(pf.total_pagado, 0))::integer as saldo,
  t.pedidos_activos::integer as pedidos_activos,
  least(
    greatest(coalesce(t.total_entregado, 0) - coalesce(pp.pagado_entregado, 0) - coalesce(pf.total_pagado, 0), 0),
    t.total_comprado - coalesce(pp.total_pagado, 0) - coalesce(pf.total_pagado, 0)
  )::integer as saldo_entregado,
  (
    (t.total_comprado - coalesce(pp.total_pagado, 0) - coalesce(pf.total_pagado, 0))
    - least(
        greatest(coalesce(t.total_entregado, 0) - coalesce(pp.pagado_entregado, 0) - coalesce(pf.total_pagado, 0), 0),
        t.total_comprado - coalesce(pp.total_pagado, 0) - coalesce(pf.total_pagado, 0)
      )
  )::integer as saldo_proceso,
  coalesce(t.pedidos_entregados, 0)::integer as pedidos_entregados,
  coalesce(t.pedidos_proceso, 0)::integer as pedidos_proceso
from (
  select cliente_id, sede_id,
         sum(total) as total_comprado,
         count(*) as pedidos_activos,
         sum(total) filter (where estado = 'entregado' or factura_id is not null) as total_entregado,
         count(*) filter (where estado = 'entregado' or factura_id is not null) as pedidos_entregados,
         count(*) filter (where estado <> 'entregado' and factura_id is null) as pedidos_proceso
  from pedidos
  where estado <> 'cancelado'
  group by cliente_id, sede_id
) t
join clientes c on c.id = t.cliente_id
join sedes s on s.id = t.sede_id
left join (
  select p.cliente_id, p.sede_id,
         sum(pg.monto) as total_pagado,
         sum(pg.monto) filter (where p.estado = 'entregado' or p.factura_id is not null) as pagado_entregado
  from pagos pg
  join pedidos p on p.id = pg.pedido_id
  where p.estado <> 'cancelado' and pg.metodo <> 'credito' and pg.anulado = false
  group by p.cliente_id, p.sede_id
) pp on pp.cliente_id = t.cliente_id and pp.sede_id = t.sede_id
left join (
  select f.cliente_id, f.sede_id, sum(pf.monto) as total_pagado
  from pagos_factura pf
  join facturas f on f.id = pf.factura_id
  where f.estado <> 'anulada' and pf.metodo <> 'credito' and pf.anulado = false
  group by f.cliente_id, f.sede_id
) pf on pf.cliente_id = t.cliente_id and pf.sede_id = t.sede_id
where t.total_comprado > (coalesce(pp.total_pagado, 0) + coalesce(pf.total_pagado, 0));

create or replace view vista_cartera_clientes as
select
  t.cliente_id as id,
  c.nombre,
  c.telefono_normalizado,
  c.cedula,
  t.total_comprado::integer as total_comprado,
  (coalesce(pp.total_pagado, 0) + coalesce(pf.total_pagado, 0))::integer as total_pagado,
  (t.total_comprado - coalesce(pp.total_pagado, 0) - coalesce(pf.total_pagado, 0))::integer as saldo,
  t.pedidos_activos::integer as pedidos_activos,
  least(
    greatest(coalesce(t.total_entregado, 0) - coalesce(pp.pagado_entregado, 0) - coalesce(pf.total_pagado, 0), 0),
    t.total_comprado - coalesce(pp.total_pagado, 0) - coalesce(pf.total_pagado, 0)
  )::integer as saldo_entregado,
  (
    (t.total_comprado - coalesce(pp.total_pagado, 0) - coalesce(pf.total_pagado, 0))
    - least(
        greatest(coalesce(t.total_entregado, 0) - coalesce(pp.pagado_entregado, 0) - coalesce(pf.total_pagado, 0), 0),
        t.total_comprado - coalesce(pp.total_pagado, 0) - coalesce(pf.total_pagado, 0)
      )
  )::integer as saldo_proceso,
  coalesce(t.pedidos_entregados, 0)::integer as pedidos_entregados,
  coalesce(t.pedidos_proceso, 0)::integer as pedidos_proceso
from (
  select cliente_id,
         sum(total) as total_comprado,
         count(*) as pedidos_activos,
         sum(total) filter (where estado = 'entregado' or factura_id is not null) as total_entregado,
         count(*) filter (where estado = 'entregado' or factura_id is not null) as pedidos_entregados,
         count(*) filter (where estado <> 'entregado' and factura_id is null) as pedidos_proceso
  from pedidos
  where estado <> 'cancelado'
  group by cliente_id
) t
join clientes c on c.id = t.cliente_id
left join (
  select p.cliente_id,
         sum(pg.monto) as total_pagado,
         sum(pg.monto) filter (where p.estado = 'entregado' or p.factura_id is not null) as pagado_entregado
  from pagos pg
  join pedidos p on p.id = pg.pedido_id
  where p.estado <> 'cancelado' and pg.metodo <> 'credito' and pg.anulado = false
  group by p.cliente_id
) pp on pp.cliente_id = t.cliente_id
left join (
  select f.cliente_id, sum(pf.monto) as total_pagado
  from pagos_factura pf
  join facturas f on f.id = pf.factura_id
  where f.estado <> 'anulada' and pf.metodo <> 'credito' and pf.anulado = false
  group by f.cliente_id
) pf on pf.cliente_id = t.cliente_id
where t.total_comprado > (coalesce(pp.total_pagado, 0) + coalesce(pf.total_pagado, 0));

-- Seguridad: sin acceso anon (regla de la migración 111)
revoke all on vista_cartera_cliente_sede, vista_cartera_clientes from anon;
