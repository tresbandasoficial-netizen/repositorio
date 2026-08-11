-- Migration 165: costo manual POR PRODUCTO (pedido_items.costo_manual)
--
-- Hasta ahora el costo a mano era UN solo total por pedido (pedidos.costo_manual,
-- migración 114). Ahora el admin puede ponerle el costo a cada producto por
-- separado desde la tabla de productos del detalle del pedido.
--
-- Reglas de costo en vista_ganancia_pedidos:
--   1. pedidos.costo_manual (total) sigue MANDANDO sobre todo si está definido.
--   2. Si es null: costo = items con costo manual + compras asignadas + salidas
--      de inventario (se suman; cada producto se costea por UNA sola vía).
-- La galería (vista_pedidos_asesor) considera costeado un pedido cuando TODOS
-- sus productos tienen costo manual, y el conteo "falta comprar" por marca deja
-- de contar los productos con costo manual propio.

alter table pedido_items add column if not exists costo_manual integer
  check (costo_manual is null or costo_manual >= 0);

create or replace view vista_ganancia_pedidos as
with venta as (
  select pedido_id, sum(precio_venta * cantidad)::int as venta
  from pedido_items
  group by pedido_id
),
costo_items as (
  select pedido_id, sum(costo_manual * cantidad)::int as costo
  from pedido_items
  where costo_manual is not null
  group by pedido_id
),
costo_compra as (
  select pedido_id, sum(costo_unitario_cop * cantidad)::int as costo
  from compra_items
  where pedido_id is not null
  group by pedido_id
),
costo_stock as (
  select m.pedido_id,
         sum(abs(m.delta) * coalesce(m.costo_unitario_cop, cp.costo_promedio, 0))::int as costo
  from movimientos_inventario m
  left join vista_costo_promedio cp
    on cp.articulo_id = m.articulo_id
   and (cp.talla is not distinct from m.talla)
  where m.tipo = 'salida' and m.pedido_id is not null
  group by m.pedido_id
),
codigo_ped as (
  select pedido_id, min(codigo) filter (where codigo is not null and codigo <> '') as codigo
  from pedido_items group by pedido_id
),
codigo_com as (
  select pedido_id, min(codigo) filter (where codigo is not null and codigo <> '') as codigo
  from compra_items where pedido_id is not null group by pedido_id
)
select
  p.id            as pedido_id,
  p.numero_orden,
  p.tipo,
  p.sede_id,
  p.cliente_id,
  p.estado,
  p.fecha_creacion,
  p.factura_id,
  coalesce(cped.codigo, ccom.codigo)                               as codigo,
  coalesce(v.venta, 0)                                             as venta,
  coalesce(p.costo_manual,
           coalesce(ci.costo, 0) + coalesce(cc.costo, 0)
             + coalesce(cs.costo, 0))                              as costo,
  (coalesce(v.venta, 0)
     - coalesce(p.costo_manual,
                coalesce(ci.costo, 0) + coalesce(cc.costo, 0)
                  + coalesce(cs.costo, 0)))                        as utilidad,
  (p.costo_manual is not null
     or (coalesce(ci.costo, 0) + coalesce(cc.costo, 0)
           + coalesce(cs.costo, 0)) > 0)                           as tiene_costo
from pedidos p
left join venta        v    on v.pedido_id    = p.id
left join costo_items  ci   on ci.pedido_id   = p.id
left join costo_compra cc   on cc.pedido_id   = p.id
left join costo_stock  cs   on cs.pedido_id   = p.id
left join codigo_ped   cped on cped.pedido_id = p.id
left join codigo_com   ccom on ccom.pedido_id = p.id
where p.estado != 'cancelado';

revoke all on vista_ganancia_pedidos from anon;

-- Galería: tiene_compra / con_costo_manual cuentan también el caso
-- "todos los productos con costo manual propio".
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
          WHERE ci.pedido_id = p.id))
      OR p.costo_manual IS NOT NULL
      OR ((EXISTS ( SELECT 1 FROM pedido_items pi WHERE pi.pedido_id = p.id))
          AND NOT (EXISTS ( SELECT 1 FROM pedido_items pi
                            WHERE pi.pedido_id = p.id AND pi.costo_manual IS NULL)))) AS tiene_compra,
    ( SELECT max(h.fecha) AS max
           FROM historial_cambios h
          WHERE h.tabla = 'pedidos'::text AND h.registro_id = p.id AND h.campo = 'estado'::text AND h.valor_nuevo = p.estado) AS fecha_estado,
    ( SELECT array_agg(DISTINCT lower(btrim(x.marca)))
           FROM ( SELECT COALESCE(NULLIF(btrim(i.marca), ''), a.marca) AS marca
                    FROM pedido_items i
                    LEFT JOIN articulos a ON a.id = i.articulo_id
                   WHERE i.pedido_id = p.id) x
          WHERE x.marca IS NOT NULL AND btrim(x.marca) <> ''::text) AS marcas,
    (p.costo_manual IS NOT NULL
      OR ((EXISTS ( SELECT 1 FROM pedido_items pi WHERE pi.pedido_id = p.id))
          AND NOT (EXISTS ( SELECT 1 FROM pedido_items pi
                            WHERE pi.pedido_id = p.id AND pi.costo_manual IS NULL)))) AS con_costo_manual
   FROM pedidos p
     JOIN sedes s ON s.id = p.sede_id
     JOIN clientes c ON c.id = p.cliente_id
     JOIN usuarios u ON u.id = p.asesor_id;

revoke all on public.vista_pedidos_asesor from anon;

-- Conteo "falta comprar" por marca: un producto con costo manual propio
-- ya está costeado y no cuenta como sin compra.
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
            and pi.costo_manual is null
            and not exists (select 1 from compra_items ci where ci.pedido_id = p.id)
       else p_estado is null or p.estado = p_estado
     end
   )
  group by m.marca
  having count(pi.id) > 0
  order by count(pi.id) desc;
$function$;
