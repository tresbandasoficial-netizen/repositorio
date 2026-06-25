-- Migration 076: marcar pagos como anulados al anular factura / cancelar pedido
--
-- Regla de negocio: cuando se ANULA una factura o se CANCELA un pedido, los
-- abonos asociados deben quedar "anulados" — no cuentan en cartera, flujo de
-- caja, cuadres ni métricas. Se MARCAN (no se borran) para conservar el rastro
-- de auditoría de que ese dinero entró alguna vez.
--
-- Diseño:
--   1. Columna `anulado boolean` en `pagos` y `pagos_factura`.
--   2. anular_factura      → marca anulado=true en sus pagos_factura.
--   3. cambiar_estado_pedido (a 'cancelado') → marca anulado=true en sus pagos.
--   4. Las vistas/queries que suman pagos excluyen anulado=true.
--
-- Nota: las vistas vista_cartera_clientes (065), vista_flujo_caja (068) y
-- vista_pagos_unificados (028) YA excluyen facturas anuladas y pedidos
-- cancelados por estado del padre, por lo que siguen siendo correctas sin
-- cambios (un pago sólo se marca anulado cuando su padre ya está anulado/
-- cancelado). Aquí se corrigen las que sumaban SIN ese filtro de padre:
-- vista_pedidos_asesor (total_pagado) y vista_facturas (total_abonado).

-- ── 1. Columna anulado ───────────────────────────────────────────────────────
alter table pagos          add column if not exists anulado boolean not null default false;
alter table pagos_factura  add column if not exists anulado boolean not null default false;

-- ── 2. anular_factura: marcar abonos como anulados ───────────────────────────
create or replace function anular_factura(p_factura_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  -- a) Pagos con mensajería pendientes generados automáticamente al facturar
  delete from pagos_mensajeria
  where factura_id = p_factura_id
    and estado = 'pendiente';

  -- b) Domicilios pendientes creados automáticamente al facturar
  delete from domicilios
  where factura_id = p_factura_id
    and estado = 'pendiente';

  -- c) Gastos automáticos de domicilio o envío ligados a esta factura
  delete from gastos
  where origen_id = p_factura_id
    and origen in ('domicilio', 'envio');

  -- d) Anular los abonos de la factura (se conservan para auditoría)
  update pagos_factura
  set anulado = true
  where factura_id = p_factura_id;

  -- e) Desvincular pedidos (siguen existiendo, vuelven a cartera libre)
  update pedidos set factura_id = null where factura_id = p_factura_id;

  -- f) Marcar factura como anulada
  update facturas
  set estado = 'anulada', actualizado_en = now()
  where id = p_factura_id;
end;
$$;

-- ── 3. cambiar_estado_pedido: anular pagos al cancelar ───────────────────────
create or replace function cambiar_estado_pedido(
  p_pedido_id    uuid,
  p_nuevo_estado text,
  p_usuario_id   uuid
)
returns void
language plpgsql
security definer
as $$
declare
  v_estado_actual text;
  v_factura_id    uuid;
  v_tipo          text;
begin
  select estado, factura_id, tipo
    into v_estado_actual, v_factura_id, v_tipo
  from pedidos
  where id = p_pedido_id
  for update;

  if not found then
    raise exception 'Pedido no encontrado: %', p_pedido_id;
  end if;

  if v_estado_actual in ('entregado', 'cancelado') then
    raise exception 'El pedido está en estado "%", no se puede cambiar', v_estado_actual;
  end if;

  if p_nuevo_estado not in ('pendiente', 'comprado', 'usa', 'bucaramanga', 'santa_rosa', 'entregado', 'cancelado') then
    raise exception 'Estado inválido: %', p_nuevo_estado;
  end if;

  if p_nuevo_estado = v_estado_actual then
    raise exception 'El pedido ya está en estado "%"', v_estado_actual;
  end if;

  -- Regla: no se puede entregar sin factura (salvo venta inmediata).
  if p_nuevo_estado = 'entregado'
     and v_factura_id is null
     and v_tipo <> 'venta_inmediata' then
    raise exception 'Debes facturar el pedido antes de entregarlo';
  end if;

  update pedidos
  set estado = p_nuevo_estado
  where id = p_pedido_id;

  -- Al cancelar, anular los abonos del pedido (se conservan para auditoría)
  if p_nuevo_estado = 'cancelado' then
    update pagos
    set anulado = true
    where pedido_id = p_pedido_id;
  end if;

  insert into historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id)
  values ('pedidos', p_pedido_id, 'estado', v_estado_actual, p_nuevo_estado, p_usuario_id);
end;
$$;

-- ── 4. vista_pedidos_asesor: excluir pagos anulados en total_pagado ──────────
-- CREATE OR REPLACE conserva las columnas (no cambian), así vista_zombies y
-- cualquier dependiente siguen válidos.
create or replace view vista_pedidos_asesor as
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
      (select sum(pg.monto) from pagos pg where pg.pedido_id = p.id and not pg.anulado),
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

-- ── 5. vista_facturas: excluir pagos anulados en total_abonado ───────────────
create or replace view vista_facturas as
select
  f.id,
  f.numero_factura,
  f.cliente_id,
  c.nombre               as cliente_nombre,
  c.telefono_normalizado as cliente_telefono,
  f.sede_id,
  s.codigo               as sede_codigo,
  s.nombre               as sede_nombre,
  f.asesor_id,
  u.nombre               as asesor_nombre,
  f.fecha_factura,
  f.fecha_vencimiento,
  f.total,
  coalesce(pg.total_abonado, 0)::integer            as total_abonado,
  (f.total - coalesce(pg.total_abonado, 0))::integer as saldo,
  case
    when f.estado in ('pagada', 'anulada') then 0
    when f.fecha_vencimiento < current_date
      then (current_date - f.fecha_vencimiento)
    else 0
  end as dias_atraso,
  f.estado,
  f.notas,
  f.creado_en
from facturas f
join clientes c on c.id = f.cliente_id
join sedes    s on s.id = f.sede_id
join usuarios u on u.id = f.asesor_id
left join (
  select factura_id, sum(monto) as total_abonado
  from pagos_factura
  where not anulado
  group by factura_id
) pg on pg.factura_id = f.id;
