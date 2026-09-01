-- Migration 186: cuenta entre sedes
--
-- Johan quiere saber cuánta plata de Bucaramanga se invierte en pedidos de
-- Santa Rosa y al revés. La cuenta se calcula SOLA (tarjeta en /gastos):
-- cada compra dice de qué cuenta salió el dinero (cuenta → sede; cuentas
-- globales = TR, el hub de compras) y el código del pedido asignado a cada
-- item (TR/SR/CR) dice para qué sede fue. No hay que marcar nada.
--
-- Las columnas sede_destino_id quedan RESERVADAS (hoy sin uso en la app):
-- servirían para marcar a mano un gasto o compra hecho para otra sede que no
-- pase por pedidos (ej. mercancía de vitrina para SR). Si se activan, ojo con
-- no contar doble contra el cálculo automático.

alter table gastos  add column if not exists sede_destino_id uuid references sedes(id);
alter table compras add column if not exists sede_destino_id uuid references sedes(id);

create index if not exists gastos_sede_destino_idx
  on gastos (sede_destino_id) where sede_destino_id is not null;
