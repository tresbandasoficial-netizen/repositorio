-- Migration 042: Campo motivo en historial de cambios
--
-- Los administradores pueden registrar el motivo de una modificación
-- (ej. "Cliente pagó de más", "Error de digitación").

alter table historial_cambios
  add column if not exists motivo text;
