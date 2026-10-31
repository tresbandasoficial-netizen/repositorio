-- Migration 213: marcar un pedido como COMPRADO sin registrar factura ni valor.
--
-- Hasta ahora un pedido solo dejaba de salir "sin compra" (rojo en la galería,
-- alertas, contador) si tenía una compra asignada o un costo manual. Las
-- asesoras necesitan avisar "ya se compró" sin tener la factura ni el valor:
-- esa marca (pedidos.comprado_marcado_en) cuenta como comprado para esos avisos,
-- pero NO pone costo, así que la ganancia del pedido sigue sin costo hasta que
-- el admin le asigne la compra (o el costo manual) de verdad.
-- Revertir: quitar la columna y volver a aplicar la vista de la migración 170 y
-- la función de la 165.

alter table pedidos add column if not exists comprado_marcado_en timestamptz;
alter table pedidos add column if not exists comprado_marcado_por uuid references usuarios(id);

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
    (pd.directo + COALESCE(fx.asignado, 0::bigint))::bigint AS total_pagado,
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
          WHERE (ci.pedido_id = p.id))) OR (p.costo_manual IS NOT NULL) OR (p.comprado_marcado_en IS NOT NULL) OR ((EXISTS ( SELECT 1
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
          WHERE ((pi.pedido_id = p.id) AND (pi.costo_manual IS NULL))))))) AS con_costo_manual,
    (p.comprado_marcado_en IS NOT NULL) AS comprado_marcado
   FROM (((pedidos p
     JOIN sedes s ON ((s.id = p.sede_id)))
     JOIN clientes c ON ((c.id = p.cliente_id)))
     JOIN usuarios u ON ((u.id = p.asesor_id)))
   -- Abonos directos del pedido.
   LEFT JOIN LATERAL (
     SELECT COALESCE(sum(pg.monto), 0)::bigint AS directo
     FROM pagos pg
     WHERE pg.pedido_id = p.id AND pg.anulado = false AND pg.metodo <> 'credito'
   ) pd ON true
   -- Parte de los abonos de la factura que le toca a ESTE pedido (FIFO, mig. 170).
   LEFT JOIN LATERAL (
     SELECT LEAST(
              GREATEST(p.total - pd.directo, 0::bigint),
              GREATEST(
                COALESCE(( SELECT sum(pf.monto) FROM pagos_factura pf
                            WHERE pf.factura_id = p.factura_id AND pf.anulado = false AND pf.metodo <> 'credito'), 0)
                - COALESCE(( SELECT sum(GREATEST(p2.total - COALESCE(( SELECT sum(pg2.monto) FROM pagos pg2
                                                   WHERE pg2.pedido_id = p2.id AND pg2.anulado = false AND pg2.metodo <> 'credito'), 0), 0))
                             FROM pedidos p2
                            WHERE p2.factura_id = p.factura_id AND p2.estado <> 'cancelado'
                              AND (p2.fecha_creacion, p2.id) < (p.fecha_creacion, p.id)), 0),
                0::bigint)
            )::bigint AS asignado
     WHERE p.factura_id IS NOT NULL
   ) fx ON true;

-- Conteo "falta comprar" por marca: los pedidos marcados como comprados ya no cuentan.
CREATE OR REPLACE FUNCTION public.conteo_articulos_por_marca(p_estado text DEFAULT NULL::text, p_solo_sin_compra boolean DEFAULT false)
 RETURNS TABLE(marca text, articulos bigint, pedidos bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    m.marca,
    count(pi.id)         as articulos,
    count(distinct p.id) as pedidos
  from (values ('ALO'),('Nike'),('Adidas'),('Puma'),('On'),
               ('Lacoste'),('Hugo Boss'),('New Balance')) as m(marca)
  join pedido_items pi
    on lower(trim(coalesce(pi.marca, ''))) = lower(m.marca)
    or lower(trim(coalesce(
         (select a.marca from articulos a where a.id = pi.articulo_id), ''))) = lower(m.marca)
  join pedidos p
    on p.id = pi.pedido_id
   and p.estado <> 'cancelado'
   and (
     case when p_solo_sin_compra
       then p.estado <> 'entregado'
            and p.costo_manual is null
            and p.comprado_marcado_en is null
            and pi.costo_manual is null
            and not exists (select 1 from compra_items ci where ci.pedido_id = p.id)
       else p_estado is null or p.estado = p_estado
     end
   )
  group by m.marca
  having count(pi.id) > 0
  order by count(pi.id) desc;
$function$;
