-- Migration 077: quitar NOT NULL de pagos.cuenta_id
--
-- El campo "cuenta destino" se eliminó de todos los formularios de pago
-- (commit 73bd7e9). Ahora los abonos se guardan con cuenta_id = null.
-- pagos_factura.cuenta_id y gastos.cuenta_id ya eran nullable, pero
-- pagos.cuenta_id había quedado como NOT NULL (restricción agregada por la
-- línea de "cuentas obligatorias"), lo que rompía la creación de pedidos con
-- abono:
--   ERROR: null value in column "cuenta_id" of relation "pagos" violates
--   not-null constraint
--
-- Se relaja la restricción para dejar la columna consistente con las otras dos.
-- No hay CHECK que exija la cuenta; el FK a cuentas(id) sigue intacto y solo
-- valida los valores no nulos.

alter table pagos alter column cuenta_id drop not null;
