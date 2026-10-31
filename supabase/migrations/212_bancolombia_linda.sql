-- Migration 212: cuenta y método de pago Bancolombia Linda (Bucaramanga).
-- Mismo patrón que 206 (Bancolombia Victor). Revertir: borrar la cuenta (si no
-- tiene movimientos) y volver a aplicar las listas de 206.
-- Con fecha_corte (31-oct-2026) y saldo inicial 0 el saldo se acumula desde hoy
-- (sin corte, una cuenta solo cuenta los movimientos del día).

insert into cuentas (nombre, tipo, metodo_pago, sede_id, activa, orden, saldo_inicial, fecha_corte)
select 'Bancolombia Linda', 'bancolombia', 'bancolombia_linda', id, true, 23, 0, '2026-10-31'
from sedes where codigo = 'TR'
  and not exists (select 1 from cuentas where metodo_pago = 'bancolombia_linda');

alter table pagos drop constraint pagos_metodo_check;
alter table pagos add constraint pagos_metodo_check check (metodo = any (array[
  'nequi_johan','nequi_marisol','nequi_luisa','bancolombia_ronaldo','bancolombia_johan',
  'bancolombia_carlos','bancolombia_cristian','bancolombia_huber','bancolombia_mayra',
  'bancolombia_jhan_carlos','bancolombia_angel','bancolombia_victor','bancolombia_linda',
  'davivienda','addi','sistecredito','efectivo','credito','bold','bold_cucuta','bold_santa_rosa',
  'recaudo_mensajeria','bancolombia','nequi','daviplata','transferencia','datafono',
  'otro','cuenta','bono']));

alter table pagos_factura drop constraint pagos_factura_metodo_check;
alter table pagos_factura add constraint pagos_factura_metodo_check check (metodo = any (array[
  'nequi_johan','nequi_marisol','nequi_luisa','bancolombia_ronaldo','bancolombia_johan',
  'bancolombia_carlos','bancolombia_cristian','bancolombia_huber','bancolombia_mayra',
  'bancolombia_jhan_carlos','bancolombia_angel','bancolombia_victor','bancolombia_linda',
  'davivienda','addi','sistecredito','efectivo','credito','bold','bold_cucuta','bold_santa_rosa',
  'recaudo_mensajeria','bancolombia','nequi','daviplata','transferencia','datafono',
  'otro','cuenta','bono']));
