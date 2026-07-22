-- Migración 122: Bold separado por sede — nace "Bold Santa Rosa" (método
-- bold_santa_rosa, sede SR) y el Bold original queda como "Bold Bucaramanga"
-- (sede TR). Mismo patrón de la migración 112 (el método identifica la cuenta).

-- 1. Aceptar el método nuevo en pagos y pagos_factura
alter table pagos drop constraint if exists pagos_metodo_check;
alter table pagos add constraint pagos_metodo_check check (metodo = any (array[
  'nequi_johan','nequi_marisol','nequi_luisa','bancolombia_ronaldo','bancolombia_johan',
  'bancolombia_carlos','bancolombia_cristian','bancolombia_huber','bancolombia_mayra',
  'davivienda','addi','sistecredito','efectivo','credito','bold','bold_cucuta','bold_santa_rosa',
  'recaudo_mensajeria','bancolombia','nequi','daviplata','transferencia','datafono',
  'otro','cuenta','bono']));

alter table pagos_factura drop constraint if exists pagos_factura_metodo_check;
alter table pagos_factura add constraint pagos_factura_metodo_check check (metodo = any (array[
  'nequi_johan','nequi_marisol','nequi_luisa','bancolombia_ronaldo','bancolombia_johan',
  'bancolombia_carlos','bancolombia_cristian','bancolombia_huber','bancolombia_mayra',
  'davivienda','addi','sistecredito','efectivo','credito','bold','bold_cucuta','bold_santa_rosa',
  'recaudo_mensajeria','bancolombia','nequi','daviplata','transferencia','datafono',
  'otro','cuenta','bono']));

-- 2. Crear la cuenta Bold Santa Rosa (si no existe)
insert into cuentas (nombre, tipo, metodo_pago, sede_id, activa, orden)
select 'Bold Santa Rosa', 'bold', 'bold_santa_rosa', s.id, true, 22
from sedes s where s.codigo = 'SR'
  and not exists (select 1 from cuentas where metodo_pago = 'bold_santa_rosa');

-- 3. El Bold original vuelve a ser de Bucaramanga, con nombre por sede
update cuentas
  set nombre = 'Bold Bucaramanga',
      sede_id = (select id from sedes where codigo = 'TR')
where metodo_pago = 'bold';
