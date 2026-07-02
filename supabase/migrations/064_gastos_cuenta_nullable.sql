-- Migration 064: gastos.cuenta_id vuelve a ser nullable
--
-- La tabla gastos (037) define cuenta_id como nullable y el código de la app
-- (crearGastoAction, flujo de caja) ya asume que puede ser null. En producción
-- existía un NOT NULL agregado fuera de las migraciones que rompía:
--   - el registro de gastos manuales sin cuenta
--   - los gastos automáticos de domicilio asumido por TB y de envío
--     (se crean al facturar, antes de pagarlos, sin cuenta de egreso)
--
-- El flujo de caja ya ignora los gastos sin cuenta (se reflejan cuando se
-- paga la mensajería / el envío). Aquí solo restauramos el diseño original.

ALTER TABLE gastos ALTER COLUMN cuenta_id DROP NOT NULL;
