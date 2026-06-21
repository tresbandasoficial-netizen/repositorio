-- Migration 028: métodos de pago granulares + vista unificada para cuadre de caja
--
-- El cuadre diario por sede necesita distinguir Bancolombia, Nequi y Daviplata
-- (antes todos caían en 'transferencia'). Se amplían los valores permitidos.
--
-- Además se crea una vista que UNIFICA los dos orígenes de dinero del negocio:
--   * pagos          (sobre pedidos)  → venta inmediata (tipo='venta_inmediata')
--                                        o abono de encargo (tipo='encargo')
--   * pagos_factura  (sobre facturas) → recaudo de cartera
--
-- No se modifica la estructura de `pagos`: solo se amplía el CHECK del método.

-- 1. Ampliar métodos permitidos en pagos.
alter table pagos
  drop constraint if exists pagos_metodo_check,
  add constraint pagos_metodo_check
    check (metodo in (
      'efectivo','bancolombia','nequi','daviplata','transferencia',
      'datafono','addi','bold','sistecredito','credito','otro'
    ));

-- 2. Mismo CHECK en pagos_factura (antes era texto libre).
alter table pagos_factura
  add constraint pagos_factura_metodo_check
    check (metodo in (
      'efectivo','bancolombia','nequi','daviplata','transferencia',
      'datafono','addi','bold','sistecredito','credito','otro'
    ));

-- 3. Vista unificada de movimientos de dinero para el cuadre de caja.
--    origen: 'venta' | 'abono' | 'cartera'
create view vista_pagos_unificados as
-- Pagos sobre pedidos: venta inmediata o abono de encargo.
select
  pg.id,
  pg.fecha,
  pg.monto,
  pg.metodo,
  pg.asesor_id,
  u.nombre        as asesor_nombre,
  p.sede_id,
  s.codigo        as sede_codigo,
  s.nombre        as sede_nombre,
  case when p.tipo = 'venta_inmediata' then 'venta' else 'abono' end as origen,
  p.numero_orden  as referencia,
  pg.creado_en
from pagos pg
join pedidos  p on p.id = pg.pedido_id
join sedes    s on s.id = p.sede_id
join usuarios u on u.id = pg.asesor_id
where p.estado != 'cancelado'

union all

-- Pagos sobre facturas: recaudo de cartera.
select
  pf.id,
  pf.fecha,
  pf.monto,
  pf.metodo,
  pf.asesor_id,
  u.nombre        as asesor_nombre,
  f.sede_id,
  s.codigo        as sede_codigo,
  s.nombre        as sede_nombre,
  'cartera'       as origen,
  f.numero_factura as referencia,
  pf.creado_en
from pagos_factura pf
join facturas f on f.id = pf.factura_id
join sedes    s on s.id = f.sede_id
join usuarios u on u.id = pf.asesor_id
where f.estado != 'anulada';
