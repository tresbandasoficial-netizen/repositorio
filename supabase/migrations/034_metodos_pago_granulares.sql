-- Migration 034: Métodos de pago granulares por persona y cuenta
--
-- Antes: bancolombia, nequi, daviplata (genéricos)
-- Ahora: nequi_johan, nequi_marisol, bancolombia_ronaldo, etc. (por cuenta específica)
--
-- Se conservan los valores anteriores en el CHECK para no romper registros existentes.

alter table pagos
  drop constraint if exists pagos_metodo_check,
  add constraint pagos_metodo_check
    check (metodo in (
      -- Nuevos (granulares)
      'nequi_johan', 'nequi_marisol', 'nequi_luisa',
      'bancolombia_ronaldo', 'bancolombia_johan', 'bancolombia_carlos',
      'bancolombia_cristian', 'bancolombia_huber',
      'davivienda', 'addi', 'sistecredito', 'efectivo', 'credito', 'bold',
      -- Anteriores (se conservan para registros históricos)
      'bancolombia', 'nequi', 'daviplata', 'transferencia', 'datafono', 'otro'
    ));

alter table pagos_factura
  drop constraint if exists pagos_factura_metodo_check,
  add constraint pagos_factura_metodo_check
    check (metodo in (
      -- Nuevos (granulares)
      'nequi_johan', 'nequi_marisol', 'nequi_luisa',
      'bancolombia_ronaldo', 'bancolombia_johan', 'bancolombia_carlos',
      'bancolombia_cristian', 'bancolombia_huber',
      'davivienda', 'addi', 'sistecredito', 'efectivo', 'credito', 'bold',
      -- Anteriores (se conservan para registros históricos)
      'bancolombia', 'nequi', 'daviplata', 'transferencia', 'datafono', 'otro'
    ));
