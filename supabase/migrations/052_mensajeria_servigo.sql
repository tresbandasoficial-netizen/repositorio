-- Migration 052: renombrar mensajería 'movilenvios' a 'servigo'
--
-- La empresa de mensajería que internamente se guardaba como 'movilenvios'
-- ahora se llama Servigo. Migramos los registros históricos y actualizamos
-- los CHECK constraints en las tablas que guardan la clave.

-- 1. domicilios: soltar constraint, migrar datos, recrear constraint
alter table domicilios
  drop constraint if exists domicilios_mensajeria_check;

update domicilios set mensajeria = 'servigo' where mensajeria = 'movilenvios';

alter table domicilios
  add constraint domicilios_mensajeria_check
    check (mensajeria in ('exneider','servigo','otro'));

-- 2. pagos_mensajeria: soltar constraint, migrar datos, recrear constraint
alter table pagos_mensajeria
  drop constraint if exists pagos_mensajeria_mensajeria_check;

update pagos_mensajeria set mensajeria = 'servigo' where mensajeria = 'movilenvios';

alter table pagos_mensajeria
  add constraint pagos_mensajeria_mensajeria_check
    check (mensajeria in ('exneider','servigo','otro'));
