-- Migration 089: liquidar mensajería POR DÍA
--
-- liquidar_mensajeria (061) liquida TODO lo pendiente de una mensajería. Este
-- RPC hace lo mismo pero solo para los débitos de UNA fecha, para poder cuadrar
-- día por día con el mensajero.

CREATE OR REPLACE FUNCTION public.liquidar_mensajeria_dia(
  p_mensajeria     text,
  p_fecha          date,
  p_monto          integer,
  p_cuenta_id      uuid    DEFAULT NULL,
  p_responsable_id uuid    DEFAULT NULL,
  p_notas          text    DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $function$
begin
  -- Marcar como liquidados solo los débitos pendientes de ESE día.
  UPDATE pagos_mensajeria
  SET estado = 'liquidado'
  WHERE mensajeria = p_mensajeria
    AND tipo = 'deuda'
    AND estado = 'pendiente'
    AND fecha = p_fecha;

  -- Registrar la liquidación de ese día.
  INSERT INTO pagos_mensajeria (
    mensajeria, tipo, monto, fecha, cuenta_id, responsable_id, estado, concepto, notas
  )
  VALUES (
    p_mensajeria, 'pago', p_monto, p_fecha, p_cuenta_id, p_responsable_id, 'liquidado', 'liquidacion', p_notas
  );
end;
$function$;
