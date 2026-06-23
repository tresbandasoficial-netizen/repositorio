-- Corregir constraint de mensajería: debe ser 'servigo', no 'movilenvios'
ALTER TABLE domicilios
  DROP CONSTRAINT domicilios_mensajeria_check,
  ADD CONSTRAINT domicilios_mensajeria_check
    CHECK (mensajeria IN ('exneider', 'servigo'));

ALTER TABLE pagos_mensajeria
  DROP CONSTRAINT pagos_mensajeria_mensajeria_check,
  ADD CONSTRAINT pagos_mensajeria_mensajeria_check
    CHECK (mensajeria IN ('exneider', 'servigo'));
