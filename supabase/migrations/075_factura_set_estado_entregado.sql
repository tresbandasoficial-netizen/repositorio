-- Migration 075: Al facturar pedidos, cambiar automáticamente su estado a 'entregado'
--
-- Cuando se emite una factura, los pedidos incluidos pasan a estado 'entregado'
-- automáticamente (si no lo estaban ya). Se registra el cambio en historial_cambios.

CREATE OR REPLACE FUNCTION public.crear_factura(
  p_cliente_id         uuid,
  p_sede_id            uuid,
  p_asesor_id          uuid,
  p_fecha_vencimiento  date,
  p_pedido_ids         uuid[],
  p_notas              text    DEFAULT NULL,
  p_abonos             jsonb   DEFAULT NULL,
  p_envio              integer DEFAULT 0,
  p_descuento          integer DEFAULT 0,
  p_tipo_entrega       text    DEFAULT 'tienda',
  p_mensajeria_entrega text    DEFAULT NULL,
  p_valor_entrega      integer DEFAULT 0,
  p_quien_paga_entrega text    DEFAULT NULL,
  p_direccion_entrega  text    DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $function$
declare
  v_factura_id uuid;
  v_numero     text;
  v_bruto      integer;
  v_prepagado  integer;
  v_subtotal   integer;
  v_total      integer;
  v_count      integer;
  v_abono      jsonb;
  v_total_abonado integer := 0;
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
  select coalesce(sum(pg.monto), 0) into v_prepagado from pagos pg where pg.pedido_id = any(p_pedido_ids);

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
    end loop;

    if v_total_abonado >= v_total then
      update facturas set estado = 'pagada', actualizado_en = now() where id = v_factura_id;
    end if;
  end if;

  -- Resolver la entrega (domicilio / envío). El mensajero recauda el SALDO
  -- pendiente de la factura (total menos lo que el cliente ya abonó).
  perform _entrega_factura(
    v_factura_id, v_numero, p_cliente_id, p_sede_id, p_asesor_id,
    greatest(v_total - v_total_abonado, 0),
    coalesce(p_tipo_entrega, 'tienda'), p_mensajeria_entrega, coalesce(p_valor_entrega, 0),
    p_quien_paga_entrega, p_direccion_entrega
  );

  return v_factura_id;
end;
$function$;
