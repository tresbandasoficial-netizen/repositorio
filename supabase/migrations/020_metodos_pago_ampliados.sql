-- Migration 020: ampliar métodos de pago a addi, bold y sistecredito
alter table pagos
  drop constraint pagos_metodo_check,
  add constraint pagos_metodo_check
    check (metodo in ('efectivo','transferencia','datafono','addi','bold','sistecredito','otro'));
