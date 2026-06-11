-- Migration 017: metodo de pago y articulo en domicilios
--
-- metodo_pago: cómo pagó el cliente (efectivo o transferencia)
-- articulo: qué se envió en el domicilio

alter table domicilios
  add column metodo_pago text not null default 'efectivo'
    check (metodo_pago in ('efectivo', 'transferencia')),
  add column articulo text;
