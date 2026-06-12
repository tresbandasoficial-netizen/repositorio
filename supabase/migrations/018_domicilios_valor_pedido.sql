-- Migration 018: valor del pedido en domicilios
--
-- valor_pedido: lo que la mensajería cobra en efectivo por el artículo.
-- Cuando metodo_pago = 'efectivo', la mensajería recoge este dinero y nos lo debe.
-- cobrar_al_cliente pasa a significar quién paga el domicilio:
--   true  = el cliente le paga el domicilio a la mensajería
--   false = nosotros le pagamos el domicilio a la mensajería

alter table domicilios
  add column valor_pedido integer not null default 0;
