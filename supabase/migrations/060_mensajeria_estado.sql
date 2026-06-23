-- Migration 060: vista de domicilios con deuda pendiente en mensajerías
-- Muestra domicilios que generaron deuda con mensajerías (tipo_cobro = 'tb_cobra')
-- con deudas aún no pagadas, usando estructura existente de pagos_mensajeria

create or replace view domicilios_deuda_pendiente as
select
  d.id,
  d.numero,
  d.mensajeria,
  d.valor_domicilio,
  d.tipo_cobro,
  d.estado,
  d.pendiente_mensajeria,
  p.numero_orden,
  c.nombre as cliente_nombre,
  c.telefono_normalizado,
  d.creado_en,
  coalesce(sum(case when pm.tipo = 'deuda' then pm.monto else 0 end), 0)::integer as deuda_total,
  coalesce(sum(case when pm.tipo = 'pago' then pm.monto else 0 end), 0)::integer as pagado_total
from domicilios d
left join pedidos p on p.id = d.pedido_id
left join clientes c on c.id = p.cliente_id
left join pagos_mensajeria pm on pm.domicilio_id = d.id
where d.tipo_cobro = 'tb_cobra'
  and d.pendiente_mensajeria = true
group by d.id, d.numero, d.mensajeria, d.valor_domicilio, d.tipo_cobro, d.estado,
         d.pendiente_mensajeria, d.creado_en, p.numero_orden, c.nombre, c.telefono_normalizado
order by d.creado_en desc;
