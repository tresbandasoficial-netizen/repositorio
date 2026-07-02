-- Migration 073: registrar_pago_pedido atómico
--
-- registrarPagoAction insertaba el pago desde Node.js en dos pasos:
--   1. Leer saldo en memoria (total - pagado)
--   2. INSERT en pagos
--
-- Entre los pasos 1 y 2 otro asesor podía hacer el mismo abono y ambos
-- pasaban la validación → sobreabono. El mismo problema que tenía
-- abonar_cliente antes de la migración 070.
--
-- Solución: RPC con FOR UPDATE en pedidos para serializar los abonos.
-- Devuelve el id del pago insertado.

CREATE OR REPLACE FUNCTION public.registrar_pago_pedido(
  p_pedido_id uuid,
  p_monto     integer,
  p_metodo    text,
  p_fecha     date,
  p_asesor_id uuid,
  p_cuenta_id uuid    DEFAULT NULL,
  p_notas     text    DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
declare
  v_total   integer;
  v_estado  text;
  v_pagado  integer;
  v_saldo   integer;
  v_pago_id uuid;
begin
  -- Lock exclusivo: dos abonos simultáneos al mismo pedido se serializan aquí.
  select total, estado
  into v_total, v_estado
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

  -- Recalcular saldo dentro del lock para evitar lectura sucia.
  select coalesce(sum(monto), 0)
  into v_pagado
  from pagos
  where pedido_id = p_pedido_id;

  v_saldo := v_total - v_pagado;

  if p_monto > v_saldo then
    raise exception 'El monto (%) supera el saldo pendiente (%)', p_monto, v_saldo;
  end if;

  insert into pagos (pedido_id, monto, metodo, fecha, asesor_id, cuenta_id, notas)
  values (p_pedido_id, p_monto, p_metodo, p_fecha, p_asesor_id, p_cuenta_id, p_notas)
  returning id into v_pago_id;

  return v_pago_id;
end;
$$;
