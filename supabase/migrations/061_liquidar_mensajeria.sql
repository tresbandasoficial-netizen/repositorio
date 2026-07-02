-- Migration 061: RPC de liquidación de mensajería
--
-- Liquida el cuadre pendiente con una mensajería en un solo paso atómico:
--   1. Marca todos los débitos pendientes (recaudo + domicilio_tb + legacys) como liquidados.
--   2. Registra la liquidación con el monto acordado.

CREATE OR REPLACE FUNCTION public.liquidar_mensajeria(
  p_mensajeria     text,
  p_monto          integer,
  p_fecha          date,
  p_cuenta_id      uuid    DEFAULT NULL,
  p_responsable_id uuid    DEFAULT NULL,
  p_notas          text    DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $function$
begin
  -- Marcar todos los débitos pendientes de esta mensajería como liquidados
  UPDATE pagos_mensajeria
  SET estado = 'liquidado'
  WHERE mensajeria = p_mensajeria
    AND tipo = 'deuda'
    AND estado = 'pendiente';

  -- Registrar la liquidación
  INSERT INTO pagos_mensajeria (
    mensajeria, tipo, monto, fecha, cuenta_id, responsable_id, estado, concepto, notas
  )
  VALUES (
    p_mensajeria, 'pago', p_monto, p_fecha, p_cuenta_id, p_responsable_id, 'liquidado', 'liquidacion', p_notas
  );
end;
$function$;
