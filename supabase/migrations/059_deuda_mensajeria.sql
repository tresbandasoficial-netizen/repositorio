-- Migration 059: vistas de estado de mensajerías
-- Usa tabla existente pagos_mensajeria (tipo='deuda' o 'pago')

-- Vista: resumen de deuda + pagado por mensajería
create or replace view mensajeria_deuda as
select
  pm.mensajeria,
  count(distinct pm.domicilio_id) as domicilios_pendientes,
  coalesce(sum(case when pm.tipo = 'deuda' then pm.monto else 0 end), 0)::integer as deuda_acumulada,
  coalesce(sum(case when pm.tipo = 'pago' then pm.monto else 0 end), 0)::integer as pagado_acumulado,
  (coalesce(sum(case when pm.tipo = 'deuda' then pm.monto else 0 end), 0) -
   coalesce(sum(case when pm.tipo = 'pago' then pm.monto else 0 end), 0))::integer as saldo_pendiente,
  (coalesce(sum(case when pm.tipo = 'deuda' then pm.monto else 0 end), 0) +
   coalesce(sum(case when pm.tipo = 'pago' then pm.monto else 0 end), 0))::integer as total_movimiento
from pagos_mensajeria pm
group by pm.mensajeria
order by pm.mensajeria;
