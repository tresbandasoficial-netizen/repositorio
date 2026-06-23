-- Corregir constraint de mensajería: debe ser 'servigo', no 'movilenvios'
ALTER TABLE domicilios
  DROP CONSTRAINT IF EXISTS domicilios_mensajeria_check,
  ADD CONSTRAINT domicilios_mensajeria_check
    CHECK (mensajeria IN ('exneider', 'servigo'));

ALTER TABLE pagos_mensajeria
  DROP CONSTRAINT IF EXISTS pagos_mensajeria_mensajeria_check,
  ADD CONSTRAINT pagos_mensajeria_mensajeria_check
    CHECK (mensajeria IN ('exneider', 'servigo'));
