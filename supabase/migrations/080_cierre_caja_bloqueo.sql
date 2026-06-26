-- Migration 080: Cierre de caja bloquea movimientos + cierre automático
--
-- A partir de ahora, cuando una sede cierra caja, los asesores ya no pueden
-- registrar movimientos de dinero/ventas de esa sede ese día (el bloqueo se
-- aplica en las server actions). El admin tiene bypass total y puede reabrir.
-- Si nadie cierra, un cron cierra la caja automáticamente a las 9:00 p.m.
--
-- Cambios de esquema:
--   1. automatico: distingue el cierre de las 9pm del cierre manual.
--   2. usuario_id pasa a ser NULL-able: el cierre automático no tiene usuario.

alter table cierres_caja
  add column if not exists automatico boolean not null default false;

alter table cierres_caja
  alter column usuario_id drop not null;
