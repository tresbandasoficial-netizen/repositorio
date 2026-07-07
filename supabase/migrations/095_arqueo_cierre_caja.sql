-- Migration 095: arqueo de efectivo en el cierre de caja
--
-- El cierre manual ahora exige contar el efectivo físico. Se guarda:
--   efectivo_esperado: lo que el sistema calcula que debe haber en caja
--   efectivo_contado:  lo que el asesor contó físicamente
--   diferencia:        contado − esperado (positivo = sobra, negativo = falta)
-- Nulos en cierres viejos y en el cierre automático de las 9pm (sin verificar).

alter table cierres_caja
  add column if not exists efectivo_esperado integer,
  add column if not exists efectivo_contado  integer,
  add column if not exists diferencia        integer;
