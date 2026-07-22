-- Migration 121: en el cuadre, los domicilios TB se seleccionan y valoran a mano
--
-- Antes, liquidar (el cuadre o un día) marcaba TODAS las deudas de domicilio
-- pendientes como liquidadas, con el valor estimado registrado al facturar.
-- Ahora las funciones reciben p_domicilios (jsonb [{id, monto}]):
--   * Si viene, SOLO esos domicilios se liquidan, cada uno con el monto que
--     la mensajería realmente cobró (se actualiza la deuda), y ese total es
--     el que se descuenta del neto / queda como gasto. Los no incluidos
--     siguen pendientes para un cuadre futuro.
--   * Si viene null, comportamiento anterior (compatibilidad).
-- Los recaudos se liquidan igual que siempre (todos los del día / todos).
--
-- Se eliminan las firmas de la migración 120 para no dejar sobrecargas.

drop function if exists public.liquidar_mensajeria(text, integer, date, uuid, uuid, text, boolean);
drop function if exists public.liquidar_mensajeria_dia(text, date, integer, uuid, uuid, text, boolean);

create function public.liquidar_mensajeria(
  p_mensajeria text, p_monto integer, p_fecha date,
  p_cuenta_id uuid default null, p_responsable_id uuid default null,
  p_notas text default null, p_tb_paga boolean default false,
  p_domicilios jsonb default null
) returns void
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  v_domicilios integer := 0;
  v_sede_tr    uuid;
  v_dom        jsonb;
begin
  if p_domicilios is not null then
    -- Solo los domicilios elegidos, con el valor que cobró la mensajería.
    for v_dom in select * from jsonb_array_elements(p_domicilios)
    loop
      update pagos_mensajeria
      set monto = (v_dom->>'monto')::integer, estado = 'liquidado'
      where id = (v_dom->>'id')::uuid and mensajeria = p_mensajeria
        and tipo = 'deuda' and estado = 'pendiente';
      if found then
        v_domicilios := v_domicilios + (v_dom->>'monto')::integer;
      end if;
    end loop;

    -- Los recaudos sí se liquidan todos.
    update pagos_mensajeria
    set estado = 'liquidado'
    where mensajeria = p_mensajeria and tipo = 'deuda' and estado = 'pendiente'
      and concepto = 'recaudo';
  else
    select coalesce(sum(monto), 0) into v_domicilios
    from pagos_mensajeria
    where mensajeria = p_mensajeria and tipo = 'deuda' and estado = 'pendiente'
      and (concepto = 'domicilio_tb' or (concepto is distinct from 'recaudo' and domicilio_id is not null));

    update pagos_mensajeria
    set estado = 'liquidado'
    where mensajeria = p_mensajeria and tipo = 'deuda' and estado = 'pendiente';
  end if;

  select id into v_sede_tr from sedes where codigo = 'TR';

  if p_tb_paga then
    insert into pagos_mensajeria (mensajeria, tipo, monto, fecha, cuenta_id, responsable_id, estado, concepto, notas)
    values (p_mensajeria, 'pago', p_monto, p_fecha, null, p_responsable_id, 'liquidado', 'liquidacion',
            coalesce(nullif(p_notas, ''), 'Cuadre') || ' · TB pagó a la mensajería');

    insert into gastos (categoria, valor, sede_id, responsable_id, fecha, origen, observacion, cuenta_id)
    values ('domicilios', p_monto, v_sede_tr, p_responsable_id, p_fecha, 'domicilio',
            'Pago a mensajería ' || p_mensajeria || ' (cuadre)', p_cuenta_id);
  else
    insert into pagos_mensajeria (mensajeria, tipo, monto, fecha, cuenta_id, responsable_id, estado, concepto, notas)
    values (p_mensajeria, 'pago', p_monto, p_fecha, p_cuenta_id, p_responsable_id, 'liquidado', 'liquidacion', p_notas);

    if v_domicilios > 0 then
      insert into gastos (categoria, valor, sede_id, responsable_id, fecha, origen, observacion, cuenta_id)
      values ('domicilios', v_domicilios, v_sede_tr, p_responsable_id, p_fecha, 'domicilio',
              'Domicilios liquidados · ' || p_mensajeria, null);
    end if;
  end if;
end;
$$;

create function public.liquidar_mensajeria_dia(
  p_mensajeria text, p_fecha date, p_monto integer,
  p_cuenta_id uuid default null, p_responsable_id uuid default null,
  p_notas text default null, p_tb_paga boolean default false,
  p_domicilios jsonb default null
) returns void
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  v_domicilios integer := 0;
  v_sede_tr    uuid;
  v_dom        jsonb;
begin
  if p_domicilios is not null then
    -- Solo los domicilios elegidos (de cualquier fecha), con su valor real.
    for v_dom in select * from jsonb_array_elements(p_domicilios)
    loop
      update pagos_mensajeria
      set monto = (v_dom->>'monto')::integer, estado = 'liquidado'
      where id = (v_dom->>'id')::uuid and mensajeria = p_mensajeria
        and tipo = 'deuda' and estado = 'pendiente';
      if found then
        v_domicilios := v_domicilios + (v_dom->>'monto')::integer;
      end if;
    end loop;

    -- Los recaudos del día sí se liquidan todos.
    update pagos_mensajeria
    set estado = 'liquidado'
    where mensajeria = p_mensajeria and tipo = 'deuda' and estado = 'pendiente'
      and fecha = p_fecha and concepto = 'recaudo';
  else
    select coalesce(sum(monto), 0) into v_domicilios
    from pagos_mensajeria
    where mensajeria = p_mensajeria and tipo = 'deuda' and estado = 'pendiente' and fecha = p_fecha
      and (concepto = 'domicilio_tb' or (concepto is distinct from 'recaudo' and domicilio_id is not null));

    update pagos_mensajeria
    set estado = 'liquidado'
    where mensajeria = p_mensajeria and tipo = 'deuda' and estado = 'pendiente' and fecha = p_fecha;
  end if;

  select id into v_sede_tr from sedes where codigo = 'TR';

  if p_tb_paga then
    insert into pagos_mensajeria (mensajeria, tipo, monto, fecha, cuenta_id, responsable_id, estado, concepto, notas)
    values (p_mensajeria, 'pago', p_monto, p_fecha, null, p_responsable_id, 'liquidado', 'liquidacion',
            coalesce(nullif(p_notas, ''), 'Cuadre del día ' || p_fecha) || ' · TB pagó a la mensajería');

    insert into gastos (categoria, valor, sede_id, responsable_id, fecha, origen, observacion, cuenta_id)
    values ('domicilios', p_monto, v_sede_tr, p_responsable_id, p_fecha, 'domicilio',
            'Pago a mensajería ' || p_mensajeria || ' (día ' || p_fecha || ')', p_cuenta_id);
  else
    insert into pagos_mensajeria (mensajeria, tipo, monto, fecha, cuenta_id, responsable_id, estado, concepto, notas)
    values (p_mensajeria, 'pago', p_monto, p_fecha, p_cuenta_id, p_responsable_id, 'liquidado', 'liquidacion', p_notas);

    if v_domicilios > 0 then
      insert into gastos (categoria, valor, sede_id, responsable_id, fecha, origen, observacion, cuenta_id)
      values ('domicilios', v_domicilios, v_sede_tr, p_responsable_id, p_fecha, 'domicilio',
              'Domicilios liquidados (día ' || p_fecha || ') · ' || p_mensajeria, null);
    end if;
  end if;
end;
$$;
