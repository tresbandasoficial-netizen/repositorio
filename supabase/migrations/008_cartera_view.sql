-- Migration 008: vista para cartera (saldo pendiente por cliente)
-- Muestra clientes con pedidos no cancelados donde total > total pagado.
-- Se consulta desde /cartera (admin) y puede usarse en el dashboard.

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
  group by cliente_id
) totales on totales.cliente_id = c.id
left join (
  select
    p.cliente_id,
    sum(pg.monto) as total_pagado
  from pagos pg
  join pedidos p on p.id = pg.pedido_id
  where p.estado != 'cancelado'
  group by p.cliente_id
) pagados on pagados.cliente_id = c.id
where totales.total_comprado > coalesce(pagados.total_pagado, 0);
