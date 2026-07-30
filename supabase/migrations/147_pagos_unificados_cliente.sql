-- El cuadre necesita saber DE QUIÉN es cada pago para agrupar los abonos que
-- un cliente entrega juntos (un billete repartido en varios pedidos).
-- Se agrega cliente_nombre al final (create or replace solo permite anexar).
create or replace view public.vista_pagos_unificados as
 select pg.id,
    pg.fecha,
    pg.monto,
    pg.metodo,
    pg.asesor_id,
    u.nombre as asesor_nombre,
    p.sede_id,
    s.codigo as sede_codigo,
    s.nombre as sede_nombre,
    case when p.tipo = 'venta_inmediata' then 'venta' else 'abono' end as origen,
    p.numero_orden as referencia,
    pg.creado_en,
    pg.confirmado,
    c.nombre as cliente_nombre
   from pagos pg
     join pedidos p on p.id = pg.pedido_id
     join sedes s on s.id = p.sede_id
     join usuarios u on u.id = pg.asesor_id
     left join clientes c on c.id = p.cliente_id
  where p.estado <> 'cancelado' and pg.anulado = false
union all
 select pf.id,
    pf.fecha,
    pf.monto,
    pf.metodo,
    pf.asesor_id,
    u.nombre,
    f.sede_id,
    s.codigo,
    s.nombre,
    'cartera',
    f.numero_factura,
    pf.creado_en,
    pf.confirmado,
    c.nombre
   from pagos_factura pf
     join facturas f on f.id = pf.factura_id
     join sedes s on s.id = f.sede_id
     join usuarios u on u.id = pf.asesor_id
     left join clientes c on c.id = f.cliente_id
  where f.estado <> 'anulada' and pf.anulado = false;
