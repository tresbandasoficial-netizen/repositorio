-- Migration 120: liquidar cuadre cuando TB le paga al mensajero (neto negativo)
--
-- Antes, liquidar un día donde TB le debía al mensajero más de lo que él
-- recaudó registraba el monto como INGRESO (tipo 'pago' con cuenta), inflando
-- las cuentas: pasó el 22-jun, 30-jun, 02-jul, 07-jul y 14-jul de 2026
-- ($124.000 de ingresos falsos, corregidos a mano el 22-jul).
--
-- Ahora las funciones reciben p_tb_paga:
--   * false (defecto): igual que antes — la mensajería paga a TB, el monto
--     entra a la cuenta y el costo de los domicilios queda como gasto
--     contable (cuenta NULL, ya viene neteado).
--   * true: TB le paga al mensajero — el registro histórico (tipo 'pago')
--     queda SIN cuenta (no suma a ningún saldo) y la salida real de dinero
--     se registra como gasto 'domicilios' en la cuenta elegida. No se crea
--     el gasto contable extra (sería doble costo).
--
-- Se eliminan las firmas viejas para que la API no quede con dos sobrecargas.

drop function if exists public.liquidar_mensajeria(text, integer, date, uuid, uuid, text);
drop function if exists public.liquidar_mensajeria_dia(text, date, integer, uuid, uuid, text);

create function public.liquidar_mensajeria(
  p_mensajeria text, p_monto integer, p_fecha date,
  p_cuenta_id uuid default null, p_responsable_id uuid default null,
  p_notas text default null, p_tb_paga boolean default false
) returns void
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  v_domicilios integer;
  v_sede_tr    uuid;
begin
  select coalesce(sum(monto), 0) into v_domicilios
  from pagos_mensajeria
  where mensajeria = p_mensajeria and tipo = 'deuda' and estado = 'pendiente'
    and (concepto = 'domicilio_tb' or (concepto is distinct from 'recaudo' and domicilio_id is not null));

  update pagos_mensajeria
  set estado = 'liquidado'
  where mensajeria = p_mensajeria and tipo = 'deuda' and estado = 'pendiente';

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
  p_notas text default null, p_tb_paga boolean default false
) returns void
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  v_domicilios integer;
  v_sede_tr    uuid;
begin
  select coalesce(sum(monto), 0) into v_domicilios
  from pagos_mensajeria
  where mensajeria = p_mensajeria and tipo = 'deuda' and estado = 'pendiente' and fecha = p_fecha
    and (concepto = 'domicilio_tb' or (concepto is distinct from 'recaudo' and domicilio_id is not null));

  update pagos_mensajeria
  set estado = 'liquidado'
  where mensajeria = p_mensajeria and tipo = 'deuda' and estado = 'pendiente' and fecha = p_fecha;

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
