-- Migration 085: confirmar/conciliar pagos en el cuadre
--
-- Permite marcar cada pago como "confirmado" (verificado que el dinero entró,
-- ej: la transferencia llegó al banco). Se marca desde el detalle del cuadre.
--   - Columna `confirmado boolean` en pagos y pagos_factura.
--   - vista_pagos_unificados expone `confirmado` (y de paso filtra anulado=false).

alter table pagos          add column if not exists confirmado boolean not null default false;
alter table pagos_factura  add column if not exists confirmado boolean not null default false;

-- Recrear la vista para exponer `confirmado` (columna al final → CREATE OR REPLACE
-- es suficiente). Se añade también el filtro anulado=false explícito.
create or replace view vista_pagos_unificados as
select
  pg.id, pg.fecha, pg.monto, pg.metodo, pg.asesor_id,
  u.nombre        as asesor_nombre,
  p.sede_id, s.codigo as sede_codigo, s.nombre as sede_nombre,
  case when p.tipo = 'venta_inmediata' then 'venta' else 'abono' end as origen,
  p.numero_orden  as referencia, pg.creado_en, pg.confirmado
from pagos pg
join pedidos  p on p.id = pg.pedido_id
join sedes    s on s.id = p.sede_id
join usuarios u on u.id = pg.asesor_id
where p.estado != 'cancelado' and pg.anulado = false

union all

select
  pf.id, pf.fecha, pf.monto, pf.metodo, pf.asesor_id,
  u.nombre        as asesor_nombre,
  f.sede_id, s.codigo as sede_codigo, s.nombre as sede_nombre,
  'cartera'       as origen,
  f.numero_factura as referencia, pf.creado_en, pf.confirmado
from pagos_factura pf
join facturas f on f.id = pf.factura_id
join sedes    s on s.id = f.sede_id
join usuarios u on u.id = pf.asesor_id
where f.estado != 'anulada' and pf.anulado = false;
