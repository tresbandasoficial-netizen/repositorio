-- Migration 057: actualizar RPC registrar_pago_factura para recibir y registrar cuenta_id

create or replace function registrar_pago_factura(
  p_factura_id uuid,
  p_monto      integer,
  p_metodo     text,
  p_fecha      date,
  p_asesor_id  uuid,
  p_cuenta_id  uuid,
  p_notas      text default null
)
returns void
language plpgsql
security definer
as $$
declare
  v_total    integer;
  v_estado   text;
  v_abonado  integer;
begin
  select total, estado into v_total, v_estado
  from facturas where id = p_factura_id for update;

  if not found then
    raise exception 'Factura no encontrada';
  end if;
  if v_estado = 'anulada' then
    raise exception 'No se pueden registrar abonos en una factura anulada';
  end if;

  select coalesce(sum(monto), 0) into v_abonado
  from pagos_factura where factura_id = p_factura_id;

  if p_monto + v_abonado > v_total then
    raise exception 'Abono excede el saldo de la factura (saldo: %)', (v_total - v_abonado);
  end if;

  insert into pagos_factura (factura_id, monto, metodo, fecha, asesor_id, cuenta_id, notas)
  values (p_factura_id, p_monto, p_metodo, p_fecha, p_asesor_id, p_cuenta_id, p_notas);

  if (p_monto + v_abonado) >= v_total then
    update facturas set estado = 'pagada' where id = p_factura_id;
  end if;
end $$;
