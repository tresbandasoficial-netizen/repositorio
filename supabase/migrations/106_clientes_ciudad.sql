-- Migration 106: ciudad del cliente
-- Campo opcional para las etiquetas de envío y datos de contacto.

alter table clientes add column if not exists ciudad text;
