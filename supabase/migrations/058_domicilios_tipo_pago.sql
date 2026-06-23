-- Migration 058: actualizar constraint pagos_mensajeria para incluir 'servigo'
-- Antes tenía 'movilenvios' que fue renombrado a 'servigo' en migración 052

alter table pagos_mensajeria drop constraint if exists pagos_mensajeria_mensajeria_check;
alter table pagos_mensajeria
  add constraint pagos_mensajeria_mensajeria_check
    check (mensajeria in ('exneider','servigo','otro'));
