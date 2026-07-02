-- Migration 041: Vistas de flujo de caja y deuda con mensajerías

-- Vista de flujo de caja por cuenta
-- Ingresos: pagos + pagos_factura con cuenta_id asignado
-- Egresos: gastos con cuenta_id asignado
-- El filtro por período se aplica en el query (no en la vista).
create or replace view vista_flujo_caja as
select
  c.id              as cuenta_id,
  c.nombre          as cuenta,
  c.tipo,
  c.sede_id,
  s.codigo          as sede_codigo,
  c.orden,
  coalesce(i.total, 0)                            as ingresos,
  coalesce(e.total, 0)                            as egresos,
  coalesce(i.total, 0) - coalesce(e.total, 0)     as neto
from cuentas c
left join sedes s on s.id = c.sede_id
left join (
  select cuenta_id, sum(monto) as total
  from (
    select cuenta_id, monto from pagos         where cuenta_id is not null and metodo != 'credito'
    union all
    select cuenta_id, monto from pagos_factura where cuenta_id is not null and metodo != 'credito'
  ) x
  group by cuenta_id
) i on i.cuenta_id = c.id
left join (
  select cuenta_id, sum(valor) as total
  from gastos
  where cuenta_id is not null
  group by cuenta_id
) e on e.cuenta_id = c.id
where c.activa = true
order by c.orden;

-- Vista de deuda pendiente con mensajerías
create or replace view vista_deuda_mensajerias as
select
  mensajeria,
  sum(case when tipo = 'deuda' then monto else 0 end)       as total_deuda,
  sum(case when tipo = 'pago'  then monto else 0 end)       as total_pagado,
  sum(case when tipo = 'deuda' then monto else -monto end)  as saldo_pendiente
from pagos_mensajeria
group by mensajeria;
