ALTER TABLE compras ADD COLUMN numero_factura text;
CREATE UNIQUE INDEX compras_numero_factura_unique ON compras (numero_factura) WHERE numero_factura IS NOT NULL;
