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
--   4. Las queries TS que suman pagos excluyen anulado=true (ver lib/queries).
--
-- Nota sobre vistas: NO se recrean aquí. Las vistas financieras
-- (vista_cartera_clientes 065, vista_flujo_caja 068, vista_pagos_unificados
-- 028, vista_morosos 027) YA excluyen facturas anuladas y pedidos cancelados
-- por el estado del padre — y un pago sólo se marca anulado cuando su padre
-- ya está anulado/cancelado, así que esas vistas siguen siendo correctas sin
-- cambios. El total_pagado de vista_pedidos_asesor y el total_abonado de
-- vista_facturas quedan como registro histórico de lo que se pagó antes de
-- anular (no alimentan ningún cálculo de caja ni de cartera).

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
