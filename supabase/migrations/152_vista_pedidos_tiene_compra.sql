-- Migration 152: vista_pedidos_asesor.tiene_compra
--
-- El filtro "Falta comprar" de la galería armaba un `id not in (...)` con
-- TODOS los pedidos que tienen compra (280+ uuids) — la URL crecía sin tope
-- y PostgREST/Kong respondía Bad Request. La vista ahora expone el booleano
-- y la app filtra con eq('tiene_compra', false). Columna nueva AL FINAL para
-- permitir create or replace.

create or replace view vista_pedidos_asesor as
 SELECT p.id,
    p.numero_orden,
    p.estado,
    p.tipo,
    p.total,
    p.tipo_entrega,
    p.direccion_entrega,
    p.notas,
    p.fecha_creacion,
    p.fecha_actualizacion,
    s.codigo AS sede_codigo,
    s.nombre AS sede_nombre,
    c.nombre AS cliente_nombre,
    c.telefono_normalizado AS cliente_telefono,
    u.nombre AS asesor_nombre,
    p.asesor_id,
    p.sede_id,
    p.cliente_id,
    p.factura_id,
    COALESCE(( SELECT sum(pg.monto) AS sum
           FROM pagos pg
          WHERE pg.pedido_id = p.id and pg.anulado = false and pg.metodo <> 'credito'), (0)::bigint) AS total_pagado,
    ( SELECT pi2.imagen_url
           FROM pedido_items pi2
          WHERE ((pi2.pedido_id = p.id) AND (pi2.imagen_url IS NOT NULL))
          ORDER BY pi2.id
         LIMIT 1) AS primera_imagen,
        CASE
            WHEN ((p.estado = 'pendiente'::text) AND (p.fecha_actualizacion < (now() - '2 days'::interval))) THEN true
            WHEN ((p.estado = 'comprado'::text) AND (p.fecha_actualizacion < (now() - '8 days'::interval))) THEN true
            WHEN ((p.estado = ANY (ARRAY['pendiente'::text, 'comprado'::text, 'usa'::text])) AND (p.fecha_creacion < (now() - '15 days'::interval))) THEN true
            WHEN ((p.estado = 'usa'::text) AND (p.fecha_actualizacion < (now() - '6 days'::interval))) THEN true
            WHEN ((p.estado = ANY (ARRAY['bucaramanga'::text, 'santa_rosa'::text])) AND (p.fecha_actualizacion < (now() - '1 day'::interval))) THEN true
            ELSE false
        END AS en_alerta,
    ((p.estado = 'pendiente'::text) AND (p.fecha_creacion < (now() - '30 days'::interval))) AS es_zombie,
    exists(select 1 from compra_items ci where ci.pedido_id = p.id) AS tiene_compra
   FROM (((pedidos p
     JOIN sedes s ON ((s.id = p.sede_id)))
     JOIN clientes c ON ((c.id = p.cliente_id)))
     JOIN usuarios u ON ((u.id = p.asesor_id)));
