-- Ganancia: no cobrar dos veces la misma prenda.
-- Cuando una prenda del pedido tiene compra asignada (costo_compra) y además
-- hay una salida de stock del mismo artículo+talla para ese pedido (p.ej. al
-- facturar), la vista sumaba ambas: TR7810 salía con -$172.000 cuando la
-- utilidad real es +$313.000. Ahora la salida de stock solo suma si esa prenda
-- NO tiene compra asignada al pedido: la compra es el costo real de la unidad.
-- Solo cambia la vista, no toca datos.
-- Revertir: volver a aplicar la definición de 165_costo_manual_por_item.sql.

create or replace view public.vista_ganancia_pedidos as
 WITH venta AS (
         SELECT pedido_items.pedido_id,
            sum(pedido_items.precio_venta * pedido_items.cantidad)::integer AS venta
           FROM pedido_items
          GROUP BY pedido_items.pedido_id
        ), costo_items AS (
         SELECT pedido_items.pedido_id,
            sum(pedido_items.costo_manual * pedido_items.cantidad)::integer AS costo
           FROM pedido_items
          WHERE pedido_items.costo_manual IS NOT NULL
          GROUP BY pedido_items.pedido_id
        ), costo_compra AS (
         SELECT compra_items.pedido_id,
            sum(compra_items.costo_unitario_cop * compra_items.cantidad)::integer AS costo
           FROM compra_items
          WHERE compra_items.pedido_id IS NOT NULL
          GROUP BY compra_items.pedido_id
        ), costo_stock AS (
         SELECT m.pedido_id,
            sum(abs(m.delta) * COALESCE(m.costo_unitario_cop, cp.costo_promedio, 0))::integer AS costo
           FROM movimientos_inventario m
             LEFT JOIN vista_costo_promedio cp ON cp.articulo_id = m.articulo_id AND NOT cp.talla IS DISTINCT FROM m.talla
          WHERE m.tipo = 'salida'::text AND m.pedido_id IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
                FROM compra_items ci
                JOIN articulos a ON a.id = m.articulo_id
               WHERE ci.pedido_id = m.pedido_id
                 AND (ci.articulo_id = m.articulo_id OR upper(btrim(ci.codigo)) = upper(btrim(a.codigo)))
                 AND upper(btrim(COALESCE(ci.talla, ''::text))) = upper(btrim(COALESCE(m.talla, ''::text)))
            )
          GROUP BY m.pedido_id
        ), codigo_ped AS (
         SELECT pedido_items.pedido_id,
            min(pedido_items.codigo) FILTER (WHERE pedido_items.codigo IS NOT NULL AND pedido_items.codigo <> ''::text) AS codigo
           FROM pedido_items
          GROUP BY pedido_items.pedido_id
        ), codigo_com AS (
         SELECT compra_items.pedido_id,
            min(compra_items.codigo) FILTER (WHERE compra_items.codigo IS NOT NULL AND compra_items.codigo <> ''::text) AS codigo
           FROM compra_items
          WHERE compra_items.pedido_id IS NOT NULL
          GROUP BY compra_items.pedido_id
        )
 SELECT p.id AS pedido_id,
    p.numero_orden,
    p.tipo,
    p.sede_id,
    p.cliente_id,
    p.estado,
    p.fecha_creacion,
    p.factura_id,
    COALESCE(cped.codigo, ccom.codigo) AS codigo,
    COALESCE(v.venta, 0) AS venta,
    COALESCE(p.costo_manual, COALESCE(ci.costo, 0) + COALESCE(cc.costo, 0) + COALESCE(cs.costo, 0)) AS costo,
    COALESCE(v.venta, 0) - COALESCE(p.costo_manual, COALESCE(ci.costo, 0) + COALESCE(cc.costo, 0) + COALESCE(cs.costo, 0)) AS utilidad,
    p.costo_manual IS NOT NULL OR (COALESCE(ci.costo, 0) + COALESCE(cc.costo, 0) + COALESCE(cs.costo, 0)) > 0 AS tiene_costo
   FROM pedidos p
     LEFT JOIN venta v ON v.pedido_id = p.id
     LEFT JOIN costo_items ci ON ci.pedido_id = p.id
     LEFT JOIN costo_compra cc ON cc.pedido_id = p.id
     LEFT JOIN costo_stock cs ON cs.pedido_id = p.id
     LEFT JOIN codigo_ped cped ON cped.pedido_id = p.id
     LEFT JOIN codigo_com ccom ON ccom.pedido_id = p.id
  WHERE p.estado <> 'cancelado'::text;
