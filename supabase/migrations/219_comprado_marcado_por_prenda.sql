-- Marcar COMPRADO sin factura (mig. 213) ahora puede ser por PRENDA.
-- Error: en la galería se marcaba "TR8428-1" como comprado y el pedido completo
-- (todas sus prendas) pasaba a comprado, porque la acción trabajaba por pedido y
-- cambiar_estado_pedido mueve todas las prendas (mig. 205).
-- Esta marca por prenda deja que, de un pedido con varias prendas, solo la elegida
-- pase a comprado y deje de salir "sin comprar". La marca del pedido
-- (pedidos.comprado_marcado_en) se pone solo cuando todas sus prendas están marcadas.
alter table public.pedido_items add column if not exists comprado_marcado_en timestamptz;
