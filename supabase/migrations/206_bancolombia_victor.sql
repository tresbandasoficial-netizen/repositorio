-- Migration 206: cuenta y método de pago Bancolombia Victor (Bucaramanga).
-- Mismo patrón que 181 (Bancolombia Angel). Revertir: borrar la cuenta (si no
-- tiene movimientos) y volver a aplicar las listas de 181.

insert into cuentas (nombre, tipo, metodo_pago, sede_id, activa, orden)
select 'Bancolombia Victor', 'bancolombia', 'bancolombia_victor', id, true, 8
from sedes where codigo = 'TR'
  and not exists (select 1 from cuentas where metodo_pago = 'bancolombia_victor');

alter table pagos drop constraint pagos_metodo_check;
alter table pagos add constraint pagos_metodo_check check (metodo = any (array[
  'nequi_johan','nequi_marisol','nequi_luisa','bancolombia_ronaldo','bancolombia_johan',
  'bancolombia_carlos','bancolombia_cristian','bancolombia_huber','bancolombia_mayra',
  'bancolombia_jhan_carlos','bancolombia_angel','bancolombia_victor',
  'davivienda','addi','sistecredito','efectivo','credito','bold','bold_cucuta','bold_santa_rosa',
  'recaudo_mensajeria','bancolombia','nequi','daviplata','transferencia','datafono',
  'otro','cuenta','bono']));

alter table pagos_factura drop constraint pagos_factura_metodo_check;
alter table pagos_factura add constraint pagos_factura_metodo_check check (metodo = any (array[
  'nequi_johan','nequi_marisol','nequi_luisa','bancolombia_ronaldo','bancolombia_johan',
  'bancolombia_carlos','bancolombia_cristian','bancolombia_huber','bancolombia_mayra',
  'bancolombia_jhan_carlos','bancolombia_angel','bancolombia_victor',
  'davivienda','addi','sistecredito','efectivo','credito','bold','bold_cucuta','bold_santa_rosa',
  'recaudo_mensajeria','bancolombia','nequi','daviplata','transferencia','datafono',
  'otro','cuenta','bono']));
