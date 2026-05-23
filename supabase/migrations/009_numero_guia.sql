-- Migration 009: campo numero_guia en pedidos
-- Permite registrar el número de rastreo del envío (USPS, FedEx, DHL, etc.)

alter table pedidos add column if not exists numero_guia text;

-- Recrear vista para incluir numero_guia
create or replace view vista_pedidos_asesor as
  select
    p.id,
    p.numero_orden,
    p.estado,
    p.total,
    p.tipo_entrega,
    p.direccion_entrega,
    p.notas,
    p.numero_guia,
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
    coalesce(
      (select sum(pg.monto) from pagos pg where pg.pedido_id = p.id),
      0
    ) as total_pagado,

    case
      when p.estado = 'pendiente'
        and p.fecha_actualizacion < now() - interval '3 days'   then true
      when p.estado = 'comprado'
        and p.fecha_actualizacion < now() - interval '7 days'   then true
      when p.estado = 'llego_usa'
        and p.fecha_actualizacion < now() - interval '15 days'  then true
      when p.estado = 'bodega_colombia'
        and p.fecha_actualizacion < now() - interval '5 days'   then true
      when p.estado = 'avisado'
        and p.fecha_actualizacion < now() - interval '3 days'   then true
      when p.estado = 'en_sede'
        and p.fecha_actualizacion < now() - interval '2 days'   then true
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

create or replace view vista_zombies as
  select * from vista_pedidos_asesor
  where es_zombie = true;
