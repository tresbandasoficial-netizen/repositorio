-- Migration 220: cuenta y método de pago Bancolombia Johan Gelvez (Bucaramanga).
-- Mismo patrón que 212 (Bancolombia Linda). Es una cuenta NUEVA, distinta de "Bancolombia Johan".
-- Con fecha_corte (hoy) y saldo inicial 0 el saldo se acumula desde hoy.
-- Revertir: borrar la cuenta (si no tiene movimientos) y volver a aplicar las listas de la 212.

insert into cuentas (nombre, tipo, metodo_pago, sede_id, activa, orden, saldo_inicial, fecha_corte, titular)
select 'Bancolombia Johan Gelvez', 'bancolombia', 'bancolombia_johan_gelvez', id, true, 9, 0,
       (now() at time zone 'America/Bogota')::date, 'Johan Gelvez'
from sedes where codigo = 'TR'
  and not exists (select 1 from cuentas where metodo_pago = 'bancolombia_johan_gelvez');

alter table pagos drop constraint pagos_metodo_check;
alter table pagos add constraint pagos_metodo_check check (metodo = any (array[
  'nequi_johan','nequi_marisol','nequi_luisa','bancolombia_ronaldo','bancolombia_johan',
  'bancolombia_carlos','bancolombia_cristian','bancolombia_huber','bancolombia_mayra',
  'bancolombia_jhan_carlos','bancolombia_angel','bancolombia_victor','bancolombia_linda',
  'bancolombia_johan_gelvez',
  'davivienda','addi','sistecredito','efectivo','credito','bold','bold_cucuta','bold_santa_rosa',
  'recaudo_mensajeria','bancolombia','nequi','daviplata','transferencia','datafono',
  'otro','cuenta','bono']));

alter table pagos_factura drop constraint pagos_factura_metodo_check;
alter table pagos_factura add constraint pagos_factura_metodo_check check (metodo = any (array[
  'nequi_johan','nequi_marisol','nequi_luisa','bancolombia_ronaldo','bancolombia_johan',
  'bancolombia_carlos','bancolombia_cristian','bancolombia_huber','bancolombia_mayra',
  'bancolombia_jhan_carlos','bancolombia_angel','bancolombia_victor','bancolombia_linda',
  'bancolombia_johan_gelvez',
  'davivienda','addi','sistecredito','efectivo','credito','bold','bold_cucuta','bold_santa_rosa',
  'recaudo_mensajeria','bancolombia','nequi','daviplata','transferencia','datafono',
  'otro','cuenta','bono']));
