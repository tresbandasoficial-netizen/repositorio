-- `vista_pedidos_asesor.total_pagado` contaba SOLO los pagos directos del pedido
-- (tabla `pagos`), ignorando los de su factura (`pagos_factura`). Como al
-- facturar la factura se emite por el NETO, un pedido entregado y pagado por
-- factura quedaba con total_pagado = 0 y toda la app le pintaba un saldo que no
-- existe: 376 pedidos mostrando "Saldo: $X" en rojo por $175.256.400 en la lista
-- de pedidos, la galería, el chat, el asistente, la etiqueta, el recibo y el CSV.
--
-- El único consumidor que salía bien era el detalle del pedido, porque sumaba
-- los abonos de la factura a mano (getPedidoDetalle). Esa parche se quita en el
-- mismo commit, para no contar doble.
--
-- Reparto: los pagos de la factura se distribuyen entre SUS pedidos en
-- proporción al saldo neto de cada uno (total − abonos directos). Cuando la
-- factura está saldada —el caso normal— a cada pedido le toca exactamente su
-- neto y el saldo queda en cero. El `least` evita que un pedido muestre más
-- pagado que su total; los sobrepagos reales los caza `vista_descuadres_cartera`.
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
    (pd.directo +
      CASE
        WHEN fx.suma_neto IS NULL OR fx.suma_neto <= 0 THEN 0::bigint
        ELSE LEAST(
          GREATEST(p.total - pd.directo, 0::bigint),
          floor((fx.pagado_factura)::numeric * (GREATEST(p.total - pd.directo, 0::bigint))::numeric
                / (fx.suma_neto)::numeric)::bigint
        )
      END)::bigint AS total_pagado,
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
    ((EXISTS ( SELECT 1
           FROM compra_items ci
          WHERE (ci.pedido_id = p.id))) OR (p.costo_manual IS NOT NULL) OR ((EXISTS ( SELECT 1
           FROM pedido_items pi
          WHERE (pi.pedido_id = p.id))) AND (NOT (EXISTS ( SELECT 1
           FROM pedido_items pi
          WHERE ((pi.pedido_id = p.id) AND (pi.costo_manual IS NULL))))))) AS tiene_compra,
    ( SELECT max(h.fecha) AS max
           FROM historial_cambios h
          WHERE ((h.tabla = 'pedidos'::text) AND (h.registro_id = p.id) AND (h.campo = 'estado'::text) AND (h.valor_nuevo = p.estado))) AS fecha_estado,
    ( SELECT array_agg(DISTINCT lower(btrim(x.marca))) AS array_agg
           FROM ( SELECT COALESCE(NULLIF(btrim(i.marca), ''::text), a.marca) AS marca
                   FROM (pedido_items i
                     LEFT JOIN articulos a ON ((a.id = i.articulo_id)))
                  WHERE (i.pedido_id = p.id)) x
          WHERE ((x.marca IS NOT NULL) AND (btrim(x.marca) <> ''::text))) AS marcas,
    ((p.costo_manual IS NOT NULL) OR ((EXISTS ( SELECT 1
           FROM pedido_items pi
          WHERE (pi.pedido_id = p.id))) AND (NOT (EXISTS ( SELECT 1
           FROM pedido_items pi
          WHERE ((pi.pedido_id = p.id) AND (pi.costo_manual IS NULL))))))) AS con_costo_manual
   FROM (((pedidos p
     JOIN sedes s ON ((s.id = p.sede_id)))
     JOIN clientes c ON ((c.id = p.cliente_id)))
     JOIN usuarios u ON ((u.id = p.asesor_id)))
   -- Abonos directos del pedido (los de siempre).
   LEFT JOIN LATERAL (
     SELECT COALESCE(sum(pg.monto), 0)::bigint AS directo
     FROM pagos pg
     WHERE pg.pedido_id = p.id AND pg.anulado = false AND pg.metodo <> 'credito'
   ) pd ON true
   -- Lo pagado en su factura y el neto que suman todos los pedidos de esa
   -- factura, para repartir proporcionalmente.
   LEFT JOIN LATERAL (
     SELECT
       COALESCE(( SELECT sum(pf.monto) FROM pagos_factura pf
                   WHERE pf.factura_id = p.factura_id AND pf.anulado = false AND pf.metodo <> 'credito'), 0)::bigint AS pagado_factura,
       COALESCE(( SELECT sum(GREATEST(p2.total - COALESCE(( SELECT sum(pg2.monto) FROM pagos pg2
                                        WHERE pg2.pedido_id = p2.id AND pg2.anulado = false AND pg2.metodo <> 'credito'), 0), 0))
                   FROM pedidos p2
                  WHERE p2.factura_id = p.factura_id AND p2.estado <> 'cancelado'), 0)::bigint AS suma_neto
     WHERE p.factura_id IS NOT NULL
   ) fx ON true;
