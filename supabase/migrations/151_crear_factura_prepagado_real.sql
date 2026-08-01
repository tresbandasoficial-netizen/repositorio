-- Migration 151: crear_factura — v_prepagado solo con pagos reales
--
-- Al emitir una factura, el neto restante descontaba TODOS los pagos previos
-- de los pedidos, incluyendo anulados y registros 'credito' → total de
-- factura menor al real. Se corrige en las dos firmas vigentes (con y sin
-- p_articulo_entrega). Solo cambia la línea de v_prepagado.

-- Firma nueva (con p_articulo_entrega) ---------------------------------------
create or replace function public.crear_factura(p_cliente_id uuid, p_sede_id uuid, p_asesor_id uuid, p_fecha_vencimiento date, p_pedido_ids uuid[], p_notas text default null::text, p_abonos jsonb default null::jsonb, p_envio integer default 0, p_descuento integer default 0, p_tipo_entrega text default 'tienda'::text, p_mensajeria_entrega text default null::text, p_valor_entrega integer default 0, p_quien_paga_entrega text default null::text, p_direccion_entrega text default null::text, p_articulo_entrega text default null::text)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_factura_id uuid;
  v_numero     text;
  v_bruto      integer;
  v_prepagado  integer;
  v_subtotal   integer;
  v_total      integer;
  v_count      integer;
  v_abono      jsonb;
  v_total_abonado      integer := 0;
  v_total_pagado_real  integer := 0;
  v_recaudo_mensajeria integer := 0;
begin
  if array_length(p_pedido_ids, 1) is null then
    raise exception 'Debe incluir al menos un pedido';
  end if;

  select count(*) into v_count
  from pedidos
  where id = any(p_pedido_ids)
    and cliente_id = p_cliente_id
    and sede_id = p_sede_id
    and estado <> 'cancelado'
    and factura_id is null;

  if v_count <> array_length(p_pedido_ids, 1) then
    raise exception 'Algun pedido no es valido: no debe estar cancelado ni facturado y debe ser del mismo cliente y sede';
  end if;

  select coalesce(sum(total), 0) into v_bruto from pedidos where id = any(p_pedido_ids);
  -- Solo pagos reales: anulados no existen y el crédito es deuda, no pago.
  select coalesce(sum(pg.monto), 0) into v_prepagado from pagos pg
  where pg.pedido_id = any(p_pedido_ids) and pg.anulado = false and pg.metodo <> 'credito';

  v_subtotal := v_bruto - v_prepagado;
  if v_subtotal < 0 then v_subtotal := 0; end if;

  v_total := v_subtotal + coalesce(p_envio, 0) - coalesce(p_descuento, 0);
  if v_total < 0 then v_total := 0; end if;

  v_numero := siguiente_numero_factura(p_sede_id);

  insert into facturas (numero_factura, cliente_id, sede_id, asesor_id, fecha_vencimiento, total, envio, descuento, notas,
                        tipo_entrega, mensajeria_entrega, valor_entrega, quien_paga_entrega)
  values (v_numero, p_cliente_id, p_sede_id, p_asesor_id, p_fecha_vencimiento, v_total, coalesce(p_envio, 0), coalesce(p_descuento, 0), p_notas,
          coalesce(p_tipo_entrega, 'tienda'), p_mensajeria_entrega, coalesce(p_valor_entrega, 0), p_quien_paga_entrega)
  returning id into v_factura_id;

  insert into historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id)
  select 'pedidos', id, 'estado', estado, 'entregado', p_asesor_id
  from pedidos
  where id = any(p_pedido_ids)
    and estado <> 'entregado';

  update pedidos
  set factura_id = v_factura_id,
      estado     = 'entregado'
  where id = any(p_pedido_ids);

  if p_abonos is not null then
    for v_abono in select * from jsonb_array_elements(p_abonos)
    loop
      insert into pagos_factura (factura_id, monto, metodo, cuenta_id, asesor_id)
      values (
        v_factura_id,
        (v_abono->>'monto')::integer,
        v_abono->>'metodo',
        nullif(v_abono->>'cuenta_id', '')::uuid,
        p_asesor_id
      );
      v_total_abonado := v_total_abonado + (v_abono->>'monto')::integer;

      if v_abono->>'metodo' <> 'credito' then
        v_total_pagado_real := v_total_pagado_real + (v_abono->>'monto')::integer;
      end if;

      if v_abono->>'metodo' = 'recaudo_mensajeria' and nullif(v_abono->>'mensajeria', '') is not null then
        insert into pagos_mensajeria (mensajeria, tipo, monto, fecha, factura_id, responsable_id, estado, concepto, notas)
        values (v_abono->>'mensajeria', 'deuda', (v_abono->>'monto')::integer, hoy_bogota(), v_factura_id, p_asesor_id, 'pendiente', 'recaudo',
                'Recaudo mensajería · factura ' || v_numero);
        v_recaudo_mensajeria := v_recaudo_mensajeria + (v_abono->>'monto')::integer;
      end if;
    end loop;

    if v_total_pagado_real >= v_total then
      update facturas set estado = 'pagada', actualizado_en = now() where id = v_factura_id;
    end if;
  end if;

  perform _entrega_factura(
    v_factura_id, v_numero, p_cliente_id, p_sede_id, p_asesor_id,
    v_recaudo_mensajeria,
    coalesce(p_tipo_entrega, 'tienda'), p_mensajeria_entrega, coalesce(p_valor_entrega, 0),
    p_quien_paga_entrega, p_direccion_entrega, p_articulo_entrega
  );

  return v_factura_id;
end;
$function$;

-- Firma vieja (sin p_articulo_entrega) ----------------------------------------
create or replace function public.crear_factura(p_cliente_id uuid, p_sede_id uuid, p_asesor_id uuid, p_fecha_vencimiento date, p_pedido_ids uuid[], p_notas text default null::text, p_abonos jsonb default null::jsonb, p_envio integer default 0, p_descuento integer default 0, p_tipo_entrega text default 'tienda'::text, p_mensajeria_entrega text default null::text, p_valor_entrega integer default 0, p_quien_paga_entrega text default null::text, p_direccion_entrega text default null::text)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_factura_id uuid;
  v_numero     text;
  v_bruto      integer;
  v_prepagado  integer;
  v_subtotal   integer;
  v_total      integer;
  v_count      integer;
  v_abono      jsonb;
  v_total_abonado      integer := 0;  -- todos los abonos (incluye crédito) → saldo a recaudar
  v_total_pagado_real  integer := 0;  -- solo pagos reales (no crédito) → liquidación
  v_recaudo_mensajeria integer := 0;  -- lo que la mensajería cobra al cliente y debe a TB
begin
  if array_length(p_pedido_ids, 1) is null then
    raise exception 'Debe incluir al menos un pedido';
  end if;

  select count(*) into v_count
  from pedidos
  where id = any(p_pedido_ids)
    and cliente_id = p_cliente_id
    and sede_id = p_sede_id
    and estado <> 'cancelado'
    and factura_id is null;

  if v_count <> array_length(p_pedido_ids, 1) then
    raise exception 'Algun pedido no es valido: no debe estar cancelado ni facturado y debe ser del mismo cliente y sede';
  end if;

  select coalesce(sum(total), 0) into v_bruto from pedidos where id = any(p_pedido_ids);
  -- Solo pagos reales: anulados no existen y el crédito es deuda, no pago.
  select coalesce(sum(pg.monto), 0) into v_prepagado from pagos pg
  where pg.pedido_id = any(p_pedido_ids) and pg.anulado = false and pg.metodo <> 'credito';

  v_subtotal := v_bruto - v_prepagado;
  if v_subtotal < 0 then v_subtotal := 0; end if;

  v_total := v_subtotal + coalesce(p_envio, 0) - coalesce(p_descuento, 0);
  if v_total < 0 then v_total := 0; end if;

  v_numero := siguiente_numero_factura(p_sede_id);

  insert into facturas (numero_factura, cliente_id, sede_id, asesor_id, fecha_vencimiento, total, envio, descuento, notas,
                        tipo_entrega, mensajeria_entrega, valor_entrega, quien_paga_entrega)
  values (v_numero, p_cliente_id, p_sede_id, p_asesor_id, p_fecha_vencimiento, v_total, coalesce(p_envio, 0), coalesce(p_descuento, 0), p_notas,
          coalesce(p_tipo_entrega, 'tienda'), p_mensajeria_entrega, coalesce(p_valor_entrega, 0), p_quien_paga_entrega)
  returning id into v_factura_id;

  -- Registrar cambio de estado en historial ANTES de actualizar (para capturar valor_anterior)
  insert into historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id)
  select 'pedidos', id, 'estado', estado, 'entregado', p_asesor_id
  from pedidos
  where id = any(p_pedido_ids)
    and estado <> 'entregado';

  -- Vincular pedidos a la factura y marcarlos como entregados
  update pedidos
  set factura_id = v_factura_id,
      estado     = 'entregado'
  where id = any(p_pedido_ids);

  if p_abonos is not null then
    for v_abono in select * from jsonb_array_elements(p_abonos)
    loop
      insert into pagos_factura (factura_id, monto, metodo, cuenta_id, asesor_id)
      values (
        v_factura_id,
        (v_abono->>'monto')::integer,
        v_abono->>'metodo',
        nullif(v_abono->>'cuenta_id', '')::uuid,
        p_asesor_id
      );
      v_total_abonado := v_total_abonado + (v_abono->>'monto')::integer;

      -- El crédito es deuda del cliente, no pago: no liquida la factura.
      if v_abono->>'metodo' <> 'credito' then
        v_total_pagado_real := v_total_pagado_real + (v_abono->>'monto')::integer;
      end if;

      -- Recaudo Mensajería: la mensajería cobra este valor al cliente y se lo
      -- debe a TB. Crea la deuda con la mensajería y alimenta el valor a cobrar
      -- del domicilio (sin esto, el domicilio aparece con $0 a cobrar).
      if v_abono->>'metodo' = 'recaudo_mensajeria' and nullif(v_abono->>'mensajeria', '') is not null then
        insert into pagos_mensajeria (mensajeria, tipo, monto, fecha, factura_id, responsable_id, estado, concepto, notas)
        values (v_abono->>'mensajeria', 'deuda', (v_abono->>'monto')::integer, hoy_bogota(), v_factura_id, p_asesor_id, 'pendiente', 'recaudo',
                'Recaudo mensajería · factura ' || v_numero);
        v_recaudo_mensajeria := v_recaudo_mensajeria + (v_abono->>'monto')::integer;
      end if;
    end loop;

    if v_total_pagado_real >= v_total then
      update facturas set estado = 'pagada', actualizado_en = now() where id = v_factura_id;
    end if;
  end if;

  -- Resolver la entrega (domicilio / envío). El mensajero cobra el recaudo
  -- explícito (líneas metodo='recaudo_mensajeria'), más el domicilio si lo
  -- paga el cliente.
  perform _entrega_factura(
    v_factura_id, v_numero, p_cliente_id, p_sede_id, p_asesor_id,
    v_recaudo_mensajeria,
    coalesce(p_tipo_entrega, 'tienda'), p_mensajeria_entrega, coalesce(p_valor_entrega, 0),
    p_quien_paga_entrega, p_direccion_entrega
  );

  return v_factura_id;
end;
$function$;
