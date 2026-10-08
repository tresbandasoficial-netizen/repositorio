-- 209: el cuadre de mensajerías ya NO descuenta domicilios.
-- El valor del domicilio sigue guardado en `domicilios` (para el mensaje de cuadre),
-- pero la app no crea gasto ni resta nada: lo que el mensajero entrega entra completo
-- a Efectivo Bucaramanga y el descuento de domicilios se registra a mano en Gastos.
-- Revertir: volver a aplicar 208 (con p_descuento).

drop function if exists public.cuadrar_mensajeria(text, jsonb, integer, date, uuid, uuid, text);

create or replace function public.cuadrar_mensajeria(
  p_mensajeria     text,
  p_items          jsonb,      -- [{ "id": uuid del cobro, "monto": valor recogido }]
  p_fecha          date,
  p_cuenta_id      uuid,       -- null = Efectivo Bucaramanga
  p_responsable_id uuid,
  p_notas          text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rol     text;
  v_item    jsonb;
  v_row     pagos_mensajeria%rowtype;
  v_monto   integer;
  v_total   integer := 0;
  v_n       integer := 0;
  v_fechas  date[] := '{}';
begin
  select rol into v_rol from usuarios where id = auth.uid();
  if v_rol is null or v_rol not in ('admin', 'asesor') then
    raise exception 'Sin permisos para cuadrar mensajerías';
  end if;
  if p_mensajeria not in ('exneider', 'servigo') then
    raise exception 'Mensajería inválida';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Marca al menos un cobro';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_monto := (v_item->>'monto')::integer;
    if v_monto is null or v_monto <= 0 then
      raise exception 'Cada cobro necesita un valor mayor a cero';
    end if;

    select * into v_row from pagos_mensajeria
    where id = (v_item->>'id')::uuid and mensajeria = p_mensajeria
      and tipo = 'deuda' and concepto = 'recaudo' and estado = 'pendiente'
    for update;
    if not found then
      raise exception 'Un cobro ya no está pendiente — recarga la página';
    end if;

    update pagos_mensajeria set monto = v_monto, estado = 'liquidado' where id = v_row.id;

    if v_monto <> v_row.monto then
      insert into historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id)
      values ('pagos_mensajeria', v_row.id, 'monto', v_row.monto::text, v_monto::text, auth.uid());
    end if;

    -- El domicilio de esa factura ya se pagó: entregado.
    update domicilios set estado = 'entregado'
    where estado = 'pendiente' and lower(mensajeria) = p_mensajeria
      and ((v_row.domicilio_id is not null and id = v_row.domicilio_id)
        or (v_row.factura_id is not null and factura_id = v_row.factura_id));

    v_total  := v_total + v_monto;
    v_n      := v_n + 1;
    v_fechas := v_fechas || v_row.fecha;
  end loop;

  -- La plata entregada entra completa y de una vez a Efectivo Bucaramanga.
  if p_cuenta_id is null then
    select id into p_cuenta_id from cuentas
    where nombre = 'Efectivo Bucaramanga' and tipo = 'efectivo' and metodo_pago = 'efectivo' and activa
    limit 1;
    if p_cuenta_id is null then
      raise exception 'No se encontró la cuenta Efectivo Bucaramanga';
    end if;
  end if;

  insert into pagos_mensajeria (mensajeria, tipo, monto, fecha, cuenta_id, responsable_id, estado, concepto, notas)
  values (p_mensajeria, 'pago', v_total, p_fecha, p_cuenta_id, p_responsable_id, 'liquidado', 'liquidacion',
          coalesce(nullif(btrim(p_notas), ''), 'Cuadre ' || p_mensajeria)
          || ' · ' || v_n || ' cobro' || case when v_n = 1 then '' else 's' end);

  -- Las deudas "TB le debe" de esos días quedan obsoletas (el descuento se maneja a mano).
  update pagos_mensajeria set estado = 'liquidado'
  where mensajeria = p_mensajeria and tipo = 'deuda' and estado = 'pendiente'
    and concepto is distinct from 'recaudo' and fecha = any (v_fechas);

  return jsonb_build_object('cobros', v_n, 'recogido', v_total, 'neto', v_total);
end;
$$;

revoke execute on function public.cuadrar_mensajeria(text, jsonb, date, uuid, uuid, text) from public, anon;
grant execute on function public.cuadrar_mensajeria(text, jsonb, date, uuid, uuid, text) to authenticated, service_role;
