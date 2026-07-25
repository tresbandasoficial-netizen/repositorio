-- Migration 130: Agregar bancolombia_jhan_carlos al CHECK constraint de pagos_factura

alter table pagos_factura drop constraint pagos_factura_metodo_check,
add constraint pagos_factura_metodo_check check (metodo = any (array[
  'nequi_johan','nequi_marisol','nequi_luisa','bancolombia_ronaldo','bancolombia_johan',
  'bancolombia_carlos','bancolombia_cristian','bancolombia_huber','bancolombia_mayra','bancolombia_jhan_carlos',
  'davivienda','addi','sistecredito','efectivo','credito','bold','bold_cucuta','bold_santa_rosa',
  'recaudo_mensajeria','bancolombia','nequi','daviplata','transferencia','datafono',
  'otro','cuenta','bono']));
