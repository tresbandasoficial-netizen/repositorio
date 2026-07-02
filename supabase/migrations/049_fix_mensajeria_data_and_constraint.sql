-- Primero, actualizar cualquier fila con 'movilenvios' o 'otro' a 'servigo'
UPDATE domicilios SET mensajeria = 'servigo' WHERE mensajeria IN ('movilenvios', 'otro');
UPDATE pagos_mensajeria SET mensajeria = 'servigo' WHERE mensajeria IN ('movilenvios', 'otro');

-- Ahora podemos cambiar la constraint sin violarla
ALTER TABLE domicilios
  DROP CONSTRAINT IF EXISTS domicilios_mensajeria_check,
  ADD CONSTRAINT domicilios_mensajeria_check
    CHECK (mensajeria IN ('exneider', 'servigo'));

ALTER TABLE pagos_mensajeria
  DROP CONSTRAINT IF EXISTS pagos_mensajeria_mensajeria_check,
  ADD CONSTRAINT pagos_mensajeria_mensajeria_check
    CHECK (mensajeria IN ('exneider', 'servigo'));
