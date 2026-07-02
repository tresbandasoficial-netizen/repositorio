-- Migration 040: Cuenta y sede en compras
--
-- Permite saber desde qué cuenta salió el dinero de cada compra
-- y qué sede es responsable del pedido.

alter table compras
  add column if not exists cuenta_id uuid references cuentas(id),
  add column if not exists sede_id   uuid references sedes(id);
