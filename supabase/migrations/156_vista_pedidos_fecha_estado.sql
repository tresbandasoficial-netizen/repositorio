-- Migration 156: fecha de llegada al estado actual en vista_pedidos_asesor
--
-- Pedido de Johan/Ronaldo: los pedidos que ya están en Bucaramanga deben
-- listarse POR ORDEN DE LLEGADA a la sede (el que llegó primero se atiende
-- primero). La llegada queda registrada en historial_cambios cuando el estado
-- cambia, así que la vista expone `fecha_estado` = última vez que el pedido
-- pasó a su estado ACTUAL (sirve igual para santa_rosa o cualquier estado).
-- NULL si no hay registro en el historial (pedidos viejos) — van de últimos.
--
-- La columna va AL FINAL (create or replace view exige mismo orden previo).

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
    (EXISTS ( SELECT 1
           FROM compra_items ci
          WHERE ci.pedido_id = p.id)) AS tiene_compra,
    ( SELECT max(h.fecha)
           FROM historial_cambios h
          WHERE h.tabla = 'pedidos'
            AND h.registro_id = p.id
            AND h.campo = 'estado'
            AND h.valor_nuevo = p.estado) AS fecha_estado
   FROM pedidos p
     JOIN sedes s ON s.id = p.sede_id
     JOIN clientes c ON c.id = p.cliente_id
     JOIN usuarios u ON u.id = p.asesor_id;

-- Regla de la migración 111: los objetos nuevos/reemplazados no deben quedar
-- accesibles para anon.
revoke all on vista_pedidos_asesor from anon;

-- Índice para que el subquery del historial no pese en listas largas
create index if not exists idx_historial_estado_pedido
  on historial_cambios (registro_id, campo, valor_nuevo, fecha)
  where tabla = 'pedidos';
