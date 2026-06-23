-- Migration 054: Recreate registrar_pago_factura with optional cuenta_id (security definer)
-- Migration 046 dropped the old RPC without recreating it.
-- This recreates it with p_cuenta_id optional and security definer to bypass RLS.
-- Also ensures cuenta_id is nullable so mensajero payments (no bank account) work.

ALTER TABLE pagos_factura ALTER COLUMN cuenta_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.registrar_pago_factura(
  p_factura_id uuid,
  p_monto      integer,
  p_metodo     text,
  p_fecha      date,
  p_asesor_id  uuid,
  p_cuenta_id  uuid DEFAULT NULL,
  p_notas      text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  v_total   integer;
  v_estado  text;
  v_abonado integer;
begin
  select total, estado into v_total, v_estado
  from facturas where id = p_factura_id for update;

  if not found then
    raise exception 'Factura no encontrada';
  end if;
  if v_estado = 'anulada' then
    raise exception 'No se pueden registrar abonos en una factura anulada';
  end if;
  if p_monto <= 0 then
    raise exception 'El monto debe ser mayor a cero';
  end if;

  select coalesce(sum(monto), 0) into v_abonado
  from pagos_factura where factura_id = p_factura_id;

  if p_monto > (v_total - v_abonado) then
    raise exception 'El monto supera el saldo pendiente';
  end if;

  insert into pagos_factura (factura_id, monto, metodo, fecha, asesor_id, cuenta_id, notas)
  values (p_factura_id, p_monto, p_metodo, p_fecha, p_asesor_id, p_cuenta_id, p_notas);

  if (v_abonado + p_monto) >= v_total then
    update facturas set estado = 'pagada', actualizado_en = now() where id = p_factura_id;
  end if;
end;
$$;
