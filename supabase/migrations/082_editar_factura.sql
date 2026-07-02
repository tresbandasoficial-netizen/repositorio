-- Migration 082: edición de facturas (solo admin desde la app)
--
-- Permite al administrador corregir una factura ya emitida: sus datos, el método
-- de pago / monto de cada abono, y (vía editar_pedido) los productos. Todo
-- recalcula total, saldo y estado para que nunca se descuadre.
--
-- Piezas:
--   1. recalcular_factura(id)      → recalcula total + estado desde los pedidos y abonos.
--   2. editar_factura_datos(...)   → cambia vencimiento, notas, envío, descuento (+ cliente).
--   3. editar_abono_factura(...)   → cambia método/monto/fecha/cuenta de un abono.
--   4. eliminar_abono_factura(id)  → anula un abono.
-- Todas terminan llamando a recalcular_factura para dejar la factura consistente.

-- ── 1. Recalcular total + estado de una factura ──────────────────────────────
-- total  = max(0, max(0, SUM(pedidos.total) − abonos_previos_en_pagos) + envío − descuento)
--          (misma fórmula que crear_factura)
-- estado = 'pagada' si los abonos reales (no crédito) cubren el total; si no,
--          'pendiente'. Nunca toca una factura 'anulada'.
create or replace function recalcular_factura(p_factura_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_estado    text;
  v_envio     integer;
  v_descuento integer;
  v_bruto     integer;
  v_prepagado integer;
  v_subtotal  integer;
  v_total     integer;
  v_abonado   integer;
begin
  select estado, coalesce(envio, 0), coalesce(descuento, 0)
    into v_estado, v_envio, v_descuento
  from facturas where id = p_factura_id for update;

  if not found then
    raise exception 'Factura no encontrada';
  end if;
  if v_estado = 'anulada' then
    return;  -- una factura anulada no se recalcula
  end if;

  -- Bruto = suma de los pedidos vinculados; prepago = abonos hechos sobre esos
  -- pedidos (tabla pagos), que ya venían descontados al emitir.
  select coalesce(sum(total), 0) into v_bruto
  from pedidos where factura_id = p_factura_id;

  select coalesce(sum(pg.monto), 0) into v_prepagado
  from pagos pg
  join pedidos p on p.id = pg.pedido_id
  where p.factura_id = p_factura_id and pg.anulado = false and pg.metodo <> 'credito';

  v_subtotal := v_bruto - v_prepagado;
  if v_subtotal < 0 then v_subtotal := 0; end if;
  v_total := v_subtotal + v_envio - v_descuento;
  if v_total < 0 then v_total := 0; end if;

  -- Abonos reales sobre la factura (no crédito, no anulados).
  select coalesce(sum(monto), 0) into v_abonado
  from pagos_factura
  where factura_id = p_factura_id and anulado = false and metodo <> 'credito';

  update facturas
  set total = v_total,
      estado = case when v_abonado >= v_total and v_total > 0 then 'pagada'
                    when v_abonado >= v_total and v_total = 0 then 'pagada'
                    else 'pendiente' end,
      actualizado_en = now()
  where id = p_factura_id;
end;
$$;

-- ── 2. Editar datos de la factura ────────────────────────────────────────────
-- Cambia cliente, vencimiento, notas, envío y descuento. Si cambia el cliente,
-- también se actualizan los pedidos vinculados para que todo quede consistente.
create or replace function editar_factura_datos(
  p_factura_id        uuid,
  p_cliente_id        uuid,
  p_fecha_vencimiento date,
  p_notas             text,
  p_envio             integer,
  p_descuento         integer
)
returns void
language plpgsql
security definer
as $$
declare
  v_estado text;
begin
  select estado into v_estado from facturas where id = p_factura_id for update;
  if not found then raise exception 'Factura no encontrada'; end if;
  if v_estado = 'anulada' then raise exception 'No se puede editar una factura anulada'; end if;

  update facturas
  set cliente_id        = p_cliente_id,
      fecha_vencimiento = p_fecha_vencimiento,
      notas             = p_notas,
      envio             = greatest(coalesce(p_envio, 0), 0),
      descuento         = greatest(coalesce(p_descuento, 0), 0),
      actualizado_en    = now()
  where id = p_factura_id;

  -- Mantener los pedidos vinculados con el mismo cliente.
  update pedidos set cliente_id = p_cliente_id where factura_id = p_factura_id;

  perform recalcular_factura(p_factura_id);
end;
$$;

-- ── 3. Editar un abono de la factura ─────────────────────────────────────────
create or replace function editar_abono_factura(
  p_abono_id  uuid,
  p_monto     integer,
  p_metodo    text,
  p_cuenta_id uuid,
  p_fecha     date
)
returns void
language plpgsql
security definer
as $$
declare
  v_factura_id uuid;
begin
  if p_monto <= 0 then raise exception 'El monto debe ser mayor a cero'; end if;

  select factura_id into v_factura_id from pagos_factura where id = p_abono_id for update;
  if not found then raise exception 'Abono no encontrado'; end if;

  update pagos_factura
  set monto     = p_monto,
      metodo    = p_metodo,
      cuenta_id = p_cuenta_id,
      fecha     = p_fecha
  where id = p_abono_id;

  perform recalcular_factura(v_factura_id);
end;
$$;

-- ── 4. Eliminar (anular) un abono de la factura ──────────────────────────────
create or replace function eliminar_abono_factura(p_abono_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_factura_id uuid;
begin
  select factura_id into v_factura_id from pagos_factura where id = p_abono_id for update;
  if not found then raise exception 'Abono no encontrado'; end if;

  update pagos_factura set anulado = true where id = p_abono_id;

  perform recalcular_factura(v_factura_id);
end;
$$;
