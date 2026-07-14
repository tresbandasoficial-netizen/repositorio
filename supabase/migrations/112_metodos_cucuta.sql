-- Migration 112: métodos de pago propios de Cúcuta
--
-- Cúcuta maneja: efectivo (Caja Cúcuta, ya existe), Bancolombia Mayra,
-- Bold Cúcuta y crédito. Se crean los métodos bancolombia_mayra y bold_cucuta
-- (el método identifica la cuenta exacta, patrón de la migración 035) y sus
-- cuentas, etiquetadas con sede CR para que el flujo de caja las agrupe allí.

-- 1. Aceptar los métodos nuevos en pagos y pagos_factura
alter table pagos drop constraint if exists pagos_metodo_check;
alter table pagos add constraint pagos_metodo_check check (metodo = any (array[
  'nequi_johan','nequi_marisol','nequi_luisa','bancolombia_ronaldo','bancolombia_johan',
  'bancolombia_carlos','bancolombia_cristian','bancolombia_huber','bancolombia_mayra',
  'davivienda','addi','sistecredito','efectivo','credito','bold','bold_cucuta',
  'recaudo_mensajeria','bancolombia','nequi','daviplata','transferencia','datafono',
  'otro','cuenta','bono']));

alter table pagos_factura drop constraint if exists pagos_factura_metodo_check;
alter table pagos_factura add constraint pagos_factura_metodo_check check (metodo = any (array[
  'nequi_johan','nequi_marisol','nequi_luisa','bancolombia_ronaldo','bancolombia_johan',
  'bancolombia_carlos','bancolombia_cristian','bancolombia_huber','bancolombia_mayra',
  'davivienda','addi','sistecredito','efectivo','credito','bold','bold_cucuta',
  'recaudo_mensajeria','bancolombia','nequi','daviplata','transferencia','datafono',
  'otro','cuenta','bono']));

-- 2. Crear las cuentas (si no existen)
insert into cuentas (nombre, tipo, metodo_pago, sede_id, activa, orden)
select 'Bancolombia Mayra', 'bancolombia', 'bancolombia_mayra', s.id, true, 20
from sedes s where s.codigo = 'CR'
  and not exists (select 1 from cuentas where metodo_pago = 'bancolombia_mayra');

insert into cuentas (nombre, tipo, metodo_pago, sede_id, activa, orden)
select 'Bold Cúcuta', 'bold', 'bold_cucuta', s.id, true, 21
from sedes s where s.codigo = 'CR'
  and not exists (select 1 from cuentas where metodo_pago = 'bold_cucuta');
