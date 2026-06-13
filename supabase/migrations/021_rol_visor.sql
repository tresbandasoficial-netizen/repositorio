-- Agrega el rol 'visor' para usuarios de solo lectura por sede (ej. Cúcuta/CR)
alter table usuarios
  drop constraint usuarios_rol_check,
  add constraint usuarios_rol_check
    check (rol in ('asesor', 'admin', 'visor'));
