-- Agrega 'credito' como método de pago
alter table pagos
  drop constraint pagos_metodo_check,
  add constraint pagos_metodo_check
    check (metodo in ('efectivo','transferencia','datafono','addi','bold','sistecredito','credito','otro'));
