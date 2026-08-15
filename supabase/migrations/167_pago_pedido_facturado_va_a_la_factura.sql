-- Un pago sobre un pedido YA FACTURADO debe entrar a la factura, no al pedido.
--
-- El problema: `registrar_pago_pedido` calculaba el saldo mirando solo la tabla
-- `pagos`, sin enterarse de que el pedido ya tenía factura. Como el flujo de
-- factura hace lo simétrico (mira solo `pagos_factura`), ninguno de los dos veía
-- al otro y el mismo dinero podía quedar registrado dos veces — o, al revés, un
-- pago caía en el pedido y la factura se quedaba "pendiente" aunque estuviera
-- paga. Los dos casos aparecieron en producción:
--
--   · TR6362 (Karen Álvarez): pago retroactivo sobre un pedido ya facturado →
--     $1.000.000 cobrado dos veces y saldo falso de $1.000.000 en otro pedido.
--   · TR-2026-0251 (Laura Benavides): pago 36 min después de emitir la factura →
--     la factura quedó en "pendiente" con $1.540.000 que la clienta ya pagó.
--
-- La regla queda como en `abonar_cliente`, que sí lo hacía bien: si el pedido
-- tiene factura activa, el pago se registra en `pagos_factura` y se valida
-- contra el saldo de la factura. Si no tiene factura, todo sigue igual que antes.
create or replace function public.registrar_pago_pedido(
  p_pedido_id uuid,
  p_monto     integer,
  p_metodo    text,
  p_fecha     date,
  p_asesor_id uuid,
  p_cuenta_id uuid default null::uuid,
  p_notas     text default null::text
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_total      integer;
  v_estado     text;
  v_factura_id uuid;
  v_fac_total  integer;
  v_pagado     integer;
  v_saldo      integer;
  v_pago_id    uuid;
begin
  select total, estado, factura_id
  into v_total, v_estado, v_factura_id
  from pedidos
  where id = p_pedido_id
  for update;

  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  if v_estado = 'cancelado' then
    raise exception 'No se pueden registrar pagos en pedidos cancelados';
  end if;

  if p_monto <= 0 then
    raise exception 'El monto debe ser mayor a cero';
  end if;

  -- ¿El pedido está facturado y la factura sigue viva?
  if v_factura_id is not null then
    select f.total into v_fac_total
    from facturas f
    where f.id = v_factura_id and f.estado <> 'anulada'
    for update;
  end if;

  -- ── Pedido facturado: el pago pertenece a la factura ──────────────────────
  if v_fac_total is not null then
    -- Solo pagos reales: los anulados no existen y el crédito es deuda, no pago.
    select coalesce(sum(monto), 0)
    into v_pagado
    from pagos_factura
    where factura_id = v_factura_id and anulado = false and metodo <> 'credito';

    v_saldo := v_fac_total - v_pagado;

    if p_metodo <> 'credito' and p_monto > v_saldo then
      raise exception 'El monto (%) supera el saldo pendiente de la factura (%)', p_monto, v_saldo;
    end if;

    insert into pagos_factura (factura_id, monto, metodo, fecha, asesor_id, cuenta_id, notas)
    values (v_factura_id, p_monto, p_metodo, p_fecha, p_asesor_id, p_cuenta_id, p_notas)
    returning id into v_pago_id;

    -- Si con este pago la factura queda saldada (con pagos reales), marcarla pagada.
    update facturas f
    set estado = 'pagada', actualizado_en = now()
    where f.id = v_factura_id
      and f.estado <> 'anulada'
      and (select coalesce(sum(monto), 0) from pagos_factura
           where factura_id = f.id and anulado = false and metodo <> 'credito') >= f.total;

    return v_pago_id;
  end if;

  -- ── Pedido sin factura: comportamiento de siempre ─────────────────────────
  select coalesce(sum(monto), 0)
  into v_pagado
  from pagos
  where pedido_id = p_pedido_id and anulado = false and metodo <> 'credito';

  v_saldo := v_total - v_pagado;

  if p_metodo <> 'credito' and p_monto > v_saldo then
    raise exception 'El monto (%) supera el saldo pendiente (%)', p_monto, v_saldo;
  end if;

  insert into pagos (pedido_id, monto, metodo, fecha, asesor_id, cuenta_id, notas)
  values (p_pedido_id, p_monto, p_metodo, p_fecha, p_asesor_id, p_cuenta_id, p_notas)
  returning id into v_pago_id;

  return v_pago_id;
end;
$function$;
