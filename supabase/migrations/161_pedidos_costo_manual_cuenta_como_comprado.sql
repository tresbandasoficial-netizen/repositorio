-- Un pedido con COSTO MANUAL ya tiene su costo resuelto: no debe salir en
-- "falta comprar" ni en rojo en la galería. tiene_compra pasa a ser "tiene
-- costo" (compra asignada O costo manual) y se agrega con_costo_manual para
-- que la galería pinte verdes sus prendas sin filtrar el valor (el monto del
-- costo NO se expone a asesores).
create or replace view public.vista_pedidos_asesor as
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
          WHERE pg.pedido_id = p.id AND pg.anulado = false AND pg.metodo <> 'credito'::text), 0::bigint) AS total_pagado,
    ( SELECT pi2.imagen_url
           FROM pedido_items pi2
          WHERE pi2.pedido_id = p.id AND pi2.imagen_url IS NOT NULL
          ORDER BY pi2.id
         LIMIT 1) AS primera_imagen,
        CASE
            WHEN p.estado = 'pendiente'::text AND p.fecha_actualizacion < (now() - '2 days'::interval) THEN true
            WHEN p.estado = 'comprado'::text AND p.fecha_actualizacion < (now() - '8 days'::interval) THEN true
            WHEN (p.estado = ANY (ARRAY['pendiente'::text, 'comprado'::text, 'usa'::text])) AND p.fecha_creacion < (now() - '15 days'::interval) THEN true
            WHEN p.estado = 'usa'::text AND p.fecha_actualizacion < (now() - '6 days'::interval) THEN true
            WHEN (p.estado = ANY (ARRAY['bucaramanga'::text, 'santa_rosa'::text])) AND p.fecha_actualizacion < (now() - '1 day'::interval) THEN true
            ELSE false
        END AS en_alerta,
    p.estado = 'pendiente'::text AND p.fecha_creacion < (now() - '30 days'::interval) AS es_zombie,
    ((EXISTS ( SELECT 1
           FROM compra_items ci
          WHERE ci.pedido_id = p.id)) OR p.costo_manual IS NOT NULL) AS tiene_compra,
    ( SELECT max(h.fecha) AS max
           FROM historial_cambios h
          WHERE h.tabla = 'pedidos'::text AND h.registro_id = p.id AND h.campo = 'estado'::text AND h.valor_nuevo = p.estado) AS fecha_estado,
    ( SELECT array_agg(DISTINCT lower(btrim(x.marca)))
           FROM ( SELECT COALESCE(NULLIF(btrim(i.marca), ''), a.marca) AS marca
                    FROM pedido_items i
                    LEFT JOIN articulos a ON a.id = i.articulo_id
                   WHERE i.pedido_id = p.id) x
          WHERE x.marca IS NOT NULL AND btrim(x.marca) <> ''::text) AS marcas,
    p.costo_manual IS NOT NULL AS con_costo_manual
   FROM pedidos p
     JOIN sedes s ON s.id = p.sede_id
     JOIN clientes c ON c.id = p.cliente_id
     JOIN usuarios u ON u.id = p.asesor_id;

revoke all on public.vista_pedidos_asesor from anon;
