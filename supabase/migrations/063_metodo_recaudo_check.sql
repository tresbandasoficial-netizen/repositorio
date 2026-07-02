-- Migration 063: permitir 'recaudo_mensajeria' en los CHECK de método de pago
--
-- pagos_factura.metodo y pagos.metodo tenían un CHECK con la lista de métodos
-- permitidos. Se agrega 'recaudo_mensajeria' para el nuevo método de pago.

ALTER TABLE pagos_factura DROP CONSTRAINT IF EXISTS pagos_factura_metodo_check;
ALTER TABLE pagos_factura ADD CONSTRAINT pagos_factura_metodo_check CHECK (
  metodo = ANY (ARRAY[
    'nequi_johan','nequi_marisol','nequi_luisa',
    'bancolombia_ronaldo','bancolombia_johan','bancolombia_carlos','bancolombia_cristian','bancolombia_huber',
    'davivienda','addi','sistecredito','efectivo','credito','bold',
    'recaudo_mensajeria',
    'bancolombia','nequi','daviplata','transferencia','datafono','otro','cuenta'
  ]::text[])
);

ALTER TABLE pagos DROP CONSTRAINT IF EXISTS pagos_metodo_check;
ALTER TABLE pagos ADD CONSTRAINT pagos_metodo_check CHECK (
  metodo = ANY (ARRAY[
    'nequi_johan','nequi_marisol','nequi_luisa',
    'bancolombia_ronaldo','bancolombia_johan','bancolombia_carlos','bancolombia_cristian','bancolombia_huber',
    'davivienda','addi','sistecredito','efectivo','credito','bold',
    'recaudo_mensajeria',
    'bancolombia','nequi','daviplata','transferencia','datafono','otro','cuenta'
  ]::text[])
);
