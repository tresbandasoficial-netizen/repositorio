-- Migration 051: allow 'cuenta' as payment method in pagos and pagos_factura
-- Conserva todos los valores existentes (granulares + históricos) y agrega 'cuenta'.

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
      'bancolombia', 'nequi', 'daviplata', 'transferencia', 'datafono', 'otro',
      -- Pago por cuenta destino
      'cuenta'
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
      'bancolombia', 'nequi', 'daviplata', 'transferencia', 'datafono', 'otro',
      -- Pago por cuenta destino
      'cuenta'
    ));
