-- Fix: "Could not choose the best candidate function between anular_factura(uuid) y
-- anular_factura(uuid, uuid)". La migración 202 creó una segunda versión con p_usuario_id
-- (default null) sin borrar la de un solo parámetro; al llamarla solo con p_factura_id
-- (cancelar o editar un pedido facturado) PostgREST no puede elegir y falla.
-- Se deja una sola función: la de dos parámetros, que con p_usuario_id omitido se comporta
-- igual que la anterior (coalesce(null, usuario del movimiento original)). No toca datos.
drop function if exists public.anular_factura(uuid);
