-- Migración 118: dirección del cliente en su ficha. Se actualiza sola al
-- crear pedidos a domicilio (la ciudad ya existe desde la 106 y también se
-- actualizará sola).
alter table public.clientes
  add column if not exists direccion text;

comment on column public.clientes.direccion is 'Última dirección de entrega conocida del cliente';
