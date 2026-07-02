-- Migration 074: agregar columna tipo a vista_pedidos_asesor
--
-- Los pedidos de venta_inmediata (VL-FAC-*) creados al facturar una venta
-- de local aparecían mezclados con los pedidos normales. La vista no incluía
-- la columna 'tipo' de la tabla pedidos, por lo que la aplicación no podía
-- filtrarlos.

drop view if exists vista_zombies cascade;
drop view if exists vista_pedidos_asesor cascade;

create view vista_pedidos_asesor as
  select
    p.id,
    p.numero_orden,
    p.estado,
    p.tipo,
    p.total,
    p.tipo_entrega,
    p.direccion_entrega,
    p.notas,
    p.fecha_creacion,
    p.fecha_actualizacion,
    s.codigo  as sede_codigo,
    s.nombre  as sede_nombre,
    c.nombre  as cliente_nombre,
    c.telefono_normalizado as cliente_telefono,
    u.nombre  as asesor_nombre,
    p.asesor_id,
    p.sede_id,
    p.cliente_id,
    p.factura_id,
    coalesce(
      (select sum(pg.monto) from pagos pg where pg.pedido_id = p.id),
      0
    ) as total_pagado,
    (
      select pi2.imagen_url
      from pedido_items pi2
      where pi2.pedido_id = p.id
        and pi2.imagen_url is not null
      order by pi2.id
      limit 1
    ) as primera_imagen,
    case
      when p.estado = 'pendiente'
        and p.fecha_actualizacion < now() - interval '2 days'    then true
      when p.estado = 'comprado'
        and p.fecha_actualizacion < now() - interval '8 days'    then true
      when p.estado in ('pendiente', 'comprado', 'usa')
        and p.fecha_creacion < now() - interval '15 days'        then true
      when p.estado = 'usa'
        and p.fecha_actualizacion < now() - interval '6 days'    then true
      when p.estado in ('bucaramanga', 'santa_rosa')
        and p.fecha_actualizacion < now() - interval '1 day'     then true
      else false
    end as en_alerta,
    (
      p.estado = 'pendiente'
      and p.fecha_creacion < now() - interval '30 days'
    ) as es_zombie

  from pedidos p
  join sedes    s on s.id = p.sede_id
  join clientes c on c.id = p.cliente_id
  join usuarios u on u.id = p.asesor_id;

create view vista_zombies as
  select * from vista_pedidos_asesor
  where es_zombie = true;
