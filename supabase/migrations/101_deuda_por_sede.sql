-- Migration 101: deuda (cartera) por sede
-- Lo que deben los clientes, agrupado por la sede del pedido:
--   comprado (pedidos no cancelados) − pagos de pedidos − pagos de facturas.
-- Incluye los saldos anteriores (son deuda real). Excluye crédito y anulados.

create or replace view deuda_por_sede as
with bruto as (
  select sede_id, sum(total) as comprado
  from pedidos where estado <> 'cancelado'
  group by sede_id
),
pag_ped as (
  select p.sede_id, sum(pg.monto) as pagado
  from pagos pg join pedidos p on p.id = pg.pedido_id
  where p.estado <> 'cancelado' and pg.anulado = false and pg.metodo <> 'credito'
  group by p.sede_id
),
pag_fac as (
  select f.sede_id, sum(pf.monto) as pagado
  from pagos_factura pf join facturas f on f.id = pf.factura_id
  where f.estado <> 'anulada' and pf.anulado = false and pf.metodo <> 'credito'
  group by f.sede_id
)
select
  s.id as sede_id, s.codigo, s.nombre,
  (coalesce(b.comprado,0) - coalesce(pp.pagado,0) - coalesce(pf.pagado,0))::bigint as saldo
from sedes s
left join bruto b on b.sede_id = s.id
left join pag_ped pp on pp.sede_id = s.id
left join pag_fac pf on pf.sede_id = s.id
order by s.codigo;

revoke all on deuda_por_sede from anon;
