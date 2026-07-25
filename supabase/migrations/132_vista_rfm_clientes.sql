-- Migration 132: Vista vista_rfm_clientes — calcula R, F, M en tiempo real

create or replace view vista_rfm_clientes as
with hoy_bogota as (
  select (now() at time zone 'America/Bogota')::date as fecha
),
pedidos_validos as (
  select
    p.cliente_id,
    p.id as pedido_id,
    p.total,
    p.fecha_creacion,
    p.factura_id
  from pedidos p
  where p.estado != 'cancelado'
    and p.cliente_id is not null
),
pagos_pedidos as (
  select
    p.pedido_id,
    sum(p.monto) as monto_pagado
  from pagos p
  where p.anulado = false
    and p.metodo != 'credito'
  group by p.pedido_id
),
pagos_facturas as (
  select
    f.id as factura_id,
    sum(pf.monto) as monto_pagado
  from pagos_factura pf
  join facturas f on f.id = pf.factura_id
  where pf.anulado = false
    and pf.metodo != 'credito'
  group by f.id
),
ventas_365 as (
  select
    pv.cliente_id,
    max(pv.fecha_creacion) as ultima_compra,
    count(distinct pv.pedido_id) as num_compras,
    coalesce(sum(coalesce(pp.monto_pagado, 0)) + sum(coalesce(pf.monto_pagado, 0)), 0) as total_pagado
  from pedidos_validos pv
  left join pagos_pedidos pp on pv.pedido_id = pp.pedido_id
  left join pagos_facturas pf on pv.factura_id = pf.factura_id
  where pv.fecha_creacion >= ((now() at time zone 'America/Bogota')::date - interval '365 days')
  group by pv.cliente_id
)
select
  c.id as cliente_id,
  c.nombre,
  c.telefono_normalizado,
  v.ultima_compra,
  (select fecha from hoy_bogota) - v.ultima_compra::date as dias_desde_ultima_compra,
  v.num_compras as frecuencia,
  v.total_pagado as monto_total
from clientes c
left join ventas_365 v on c.id = v.cliente_id;

-- Índices para velocidad
create index if not exists idx_pedidos_cliente_id on pedidos(cliente_id);
create index if not exists idx_pedidos_fecha_creacion on pedidos(fecha_creacion desc);
create index if not exists idx_pagos_factura_anulado on pagos_factura(anulado) where anulado = false;
create index if not exists idx_pagos_anulado on pagos(anulado) where anulado = false;
