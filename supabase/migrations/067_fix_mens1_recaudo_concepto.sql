-- Migration 067: Corregir registros de recaudo mensajería sin concepto (MENS-1)
--
-- Problema: cuando el mensajero cobraba el saldo de una factura durante el
-- domicilio (tipo_cobro='mensajero'), la acción en domicilios.ts insertaba
-- en pagos_mensajeria con tipo='deuda' pero sin `concepto` (NULL).
-- La lógica de mensajerias.ts clasifica todo lo que no tenga concepto='recaudo'
-- como 'domicilio_tb' (TB le debe al mensajero), dejando invertida la deuda:
-- el sistema creía que TB debía pagar al mensajero cuando en realidad era
-- el mensajero quien debía traer el recaudo a TB.
--
-- Solución: poner concepto='recaudo' en todos los registros afectados.
-- Son identificables porque su nota dice "Saldo de factura cobrado en domicilio"
-- y tienen concepto IS NULL (los registros correctos ya tienen concepto='recaudo').

UPDATE pagos_mensajeria
SET concepto = 'recaudo',
    estado   = 'pendiente'
WHERE concepto IS NULL
  AND tipo    = 'deuda'
  AND notas LIKE 'Saldo de factura cobrado%';
