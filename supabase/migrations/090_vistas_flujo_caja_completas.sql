-- Migration 090: vistas de flujo de caja completas
--
-- saldos_cuentas y flujo_caja_diario solo contaban pagos_factura (ingresos) y
-- gastos (egresos). No incluían: abonos de pedidos (pagos), liquidaciones de
-- mensajería (pagos_mensajeria tipo='pago') ni traslados entre cajas
-- (traslados_caja). Además el doble LEFT JOIN multiplicaba filas (producto
-- cartesiano) inflando las sumas, y el "día" se evaluaba en UTC (a partir de
-- las 7pm Bogotá contaba como el día siguiente).
--
-- Se redefinen con subconsultas por cuenta (sin fan-out), todas las fuentes,
-- y la fecha de negocio (columna fecha, igual que el cuadre) en hora Bogotá.

create or replace view saldos_cuentas as
select
  id, nombre, tipo, sede_codigo,
  total_ingresos,
  total_egresos,
  (total_ingresos - total_egresos)::integer as saldo_neto
from (
  select
    c.id,
    c.nombre,
    c.tipo,
    s.codigo as sede_codigo,
    (
      coalesce((select sum(p.monto)  from pagos p          where p.cuenta_id = c.id and p.anulado = false and p.metodo <> 'credito'), 0)
      + coalesce((select sum(pf.monto) from pagos_factura pf where pf.cuenta_id = c.id and pf.anulado = false and pf.metodo <> 'credito'), 0)
      + coalesce((select sum(pm.monto) from pagos_mensajeria pm where pm.cuenta_id = c.id and pm.tipo = 'pago'), 0)
      + coalesce((select sum(t.monto)  from traslados_caja t where t.destino_cuenta_id = c.id), 0)
    )::integer as total_ingresos,
    (
      coalesce((select sum(g.valor) from gastos g where g.cuenta_id = c.id), 0)
      + coalesce((select sum(t.monto) from traslados_caja t where t.origen_cuenta_id = c.id), 0)
    )::integer as total_egresos
  from cuentas c
  left join sedes s on s.id = c.sede_id
) x
order by nombre;

create or replace view flujo_caja_diario as
select
  dia as fecha,
  cuenta_id,
  sede_id,
  cuenta_nombre,
  tipo,
  ingresos_hoy,
  egresos_hoy,
  (ingresos_hoy - egresos_hoy)::integer as neto_hoy
from (
  select
    (now() at time zone 'America/Bogota')::date as dia,
    c.id as cuenta_id,
    c.sede_id,
    c.nombre as cuenta_nombre,
    c.tipo,
    (
      coalesce((select sum(p.monto)  from pagos p          where p.cuenta_id = c.id and p.anulado = false and p.metodo <> 'credito' and p.fecha = (now() at time zone 'America/Bogota')::date), 0)
      + coalesce((select sum(pf.monto) from pagos_factura pf where pf.cuenta_id = c.id and pf.anulado = false and pf.metodo <> 'credito' and pf.fecha = (now() at time zone 'America/Bogota')::date), 0)
      + coalesce((select sum(pm.monto) from pagos_mensajeria pm where pm.cuenta_id = c.id and pm.tipo = 'pago' and (pm.creado_en at time zone 'America/Bogota')::date = (now() at time zone 'America/Bogota')::date), 0)
      + coalesce((select sum(t.monto)  from traslados_caja t where t.destino_cuenta_id = c.id and t.fecha = (now() at time zone 'America/Bogota')::date), 0)
    )::integer as ingresos_hoy,
    (
      coalesce((select sum(g.valor) from gastos g where g.cuenta_id = c.id and g.fecha = (now() at time zone 'America/Bogota')::date), 0)
      + coalesce((select sum(t.monto) from traslados_caja t where t.origen_cuenta_id = c.id and t.fecha = (now() at time zone 'America/Bogota')::date), 0)
    )::integer as egresos_hoy
  from cuentas c
) x
order by cuenta_nombre;
