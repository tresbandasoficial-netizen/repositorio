-- Migration 116: el domicilio asumido por TB NO descuenta el día de la factura
--
-- Antes, al facturar con "domicilio asumido por TB" se creaba un GASTO
-- inmediato (que el cuadre del día restaba del efectivo de la sede) ADEMÁS
-- de la deuda con la mensajería. Es decir, el costo golpeaba la caja antes
-- de pagarle al mensajero.
--
-- Ahora:
--   * Al facturar solo queda la DEUDA con la mensajería (pagos_mensajeria,
--     concepto 'domicilio_tb', pendiente). Nada toca el efectivo ni el cuadre.
--   * Al LIQUIDAR (liquidar_mensajeria / liquidar_mensajeria_dia) se registra
--     el gasto 'domicilios' por el total de deudas de domicilio liquidadas,
--     con cuenta NULL: el efecto de caja real ya viene en el neto de la
--     liquidación, el gasto es el registro contable del costo.

-- 1. _entrega_factura sin el gasto inmediato del domicilio
create or replace function public._entrega_factura(
  p_factura_id uuid, p_numero text, p_cliente_id uuid, p_sede_id uuid,
  p_asesor_id uuid, p_recaudo integer, p_tipo_entrega text, p_mensajeria text,
  p_valor integer, p_quien_paga text, p_direccion text, p_articulo text default null
) returns void
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  v_cobrar integer;
  v_cli    record;
begin
  if p_tipo_entrega = 'domicilio' and p_mensajeria is not null then

    if p_quien_paga = 'cliente' then
      v_cobrar := coalesce(p_recaudo, 0) + coalesce(p_valor, 0);
    else
      v_cobrar := coalesce(p_recaudo, 0);
      if coalesce(p_valor, 0) > 0 then
        -- Solo la deuda con la mensajería; el gasto se registra al liquidar.
        insert into pagos_mensajeria (mensajeria, tipo, monto, fecha, factura_id, responsable_id, estado, concepto, notas)
        values (p_mensajeria, 'deuda', p_valor, hoy_bogota(), p_factura_id, p_asesor_id, 'pendiente', 'domicilio_tb',
                'Domicilio asumido por TB · factura ' || p_numero);
      end if;
    end if;

    select nombre, telefono_normalizado into v_cli from clientes where id = p_cliente_id;

    insert into domicilios (
      factura_id, mensajeria, valor_pedido, valor_domicilio, valor_a_cobrar,
      origen, estado, asesor_id, fecha, metodo_pago,
      cliente_nombre, cliente_telefono, direccion, cobrar_al_cliente, tipo_cobro, numero_pedido, articulo
    )
    values (
      p_factura_id, p_mensajeria, coalesce(p_recaudo, 0), coalesce(p_valor, 0), v_cobrar,
      'factura', 'pendiente', p_asesor_id, hoy_bogota(), 'efectivo',
      coalesce(v_cli.nombre, 'Cliente'), v_cli.telefono_normalizado, p_direccion,
      (p_quien_paga = 'cliente'),
      case when p_quien_paga = 'cliente' then 'mensajero' else 'tb_cobra' end,
      p_numero, p_articulo
    );

  elsif p_tipo_entrega = 'envio'
        and coalesce(p_valor, 0) > 0
        and coalesce(p_quien_paga, '') <> 'contra_entrega' then
    insert into gastos (categoria, valor, sede_id, responsable_id, fecha, origen, origen_id, observacion)
    values ('envio', p_valor, p_sede_id, p_asesor_id, hoy_bogota(), 'envio', p_factura_id,
            case when p_quien_paga = 'cliente' then 'Envío cobrado al cliente'
                 else 'Envío asumido por TB' end);
  end if;
end;
$$;

-- 2. liquidar_mensajeria: al liquidar, registrar el gasto de los domicilios
create or replace function public.liquidar_mensajeria(
  p_mensajeria text, p_monto integer, p_fecha date,
  p_cuenta_id uuid default null, p_responsable_id uuid default null, p_notas text default null
) returns void
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  v_domicilios integer;
  v_sede_tr    uuid;
begin
  -- Total de deudas de DOMICILIO que se liquidan ahora (las de recaudo no son gasto)
  select coalesce(sum(monto), 0) into v_domicilios
  from pagos_mensajeria
  where mensajeria = p_mensajeria and tipo = 'deuda' and estado = 'pendiente'
    and (concepto = 'domicilio_tb' or (concepto is distinct from 'recaudo' and domicilio_id is not null));

  update pagos_mensajeria
  set estado = 'liquidado'
  where mensajeria = p_mensajeria and tipo = 'deuda' and estado = 'pendiente';

  insert into pagos_mensajeria (mensajeria, tipo, monto, fecha, cuenta_id, responsable_id, estado, concepto, notas)
  values (p_mensajeria, 'pago', p_monto, p_fecha, p_cuenta_id, p_responsable_id, 'liquidado', 'liquidacion', p_notas);

  -- Registro contable del costo de los domicilios (cuenta NULL: el efecto de
  -- caja ya está en el neto de la liquidación).
  if v_domicilios > 0 then
    select id into v_sede_tr from sedes where codigo = 'TR';
    insert into gastos (categoria, valor, sede_id, responsable_id, fecha, origen, observacion, cuenta_id)
    values ('domicilios', v_domicilios, v_sede_tr, p_responsable_id, p_fecha, 'domicilio',
            'Domicilios liquidados · ' || p_mensajeria, null);
  end if;
end;
$$;

-- 3. liquidar_mensajeria_dia: igual, pero solo las deudas de ese día
create or replace function public.liquidar_mensajeria_dia(
  p_mensajeria text, p_fecha date, p_monto integer,
  p_cuenta_id uuid default null, p_responsable_id uuid default null, p_notas text default null
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

  insert into pagos_mensajeria (mensajeria, tipo, monto, fecha, cuenta_id, responsable_id, estado, concepto, notas)
  values (p_mensajeria, 'pago', p_monto, p_fecha, p_cuenta_id, p_responsable_id, 'liquidado', 'liquidacion', p_notas);

  if v_domicilios > 0 then
    select id into v_sede_tr from sedes where codigo = 'TR';
    insert into gastos (categoria, valor, sede_id, responsable_id, fecha, origen, observacion, cuenta_id)
    values ('domicilios', v_domicilios, v_sede_tr, p_responsable_id, p_fecha, 'domicilio',
            'Domicilios liquidados (día ' || p_fecha || ') · ' || p_mensajeria, null);
  end if;
end;
$$;
