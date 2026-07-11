-- Migration 100: los saldos antiguos (deudas cargadas) no son pedidos de venta
--
-- 'Cargar saldo antiguo' creaba un pedido normal (tipo encargo, estado
-- entregado), así que la deuda aparecía como un pedido de venta en las listas
-- y sumaba en las ventas del cuadre/estadísticas. Ahora tienen su propio tipo
-- 'saldo_anterior' y número con prefijo SALDO-: siguen contando en Cartera
-- (es la deuda real), pero se excluyen de las listas de pedidos y de las ventas.

alter table pedidos drop constraint pedidos_tipo_check;
alter table pedidos add constraint pedidos_tipo_check
  check (tipo = any (array['encargo','venta_inmediata','saldo_anterior']));

update pedidos
set tipo = 'saldo_anterior',
    numero_orden = case when numero_orden like 'SALDO-%' then numero_orden else 'SALDO-' || numero_orden end
where notas ilike 'Saldo anterior%';
