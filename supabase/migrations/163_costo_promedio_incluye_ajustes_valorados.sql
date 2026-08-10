-- El costo promedio solo miraba movimientos tipo 'entrada': los AJUSTES de
-- conteo valorados (con costo_unitario_cop) no contaban y el inventario
-- contado quedaba "sin costo" aunque se le pusiera valor. Ahora cuenta todo
-- movimiento POSITIVO con costo (entradas y ajustes valorados).
create or replace view public.vista_costo_promedio as
 SELECT articulo_id,
    talla,
    round(sum(delta * costo_unitario_cop)::numeric / NULLIF(sum(delta), 0)::numeric)::integer AS costo_promedio
   FROM movimientos_inventario m
  WHERE delta > 0 AND costo_unitario_cop IS NOT NULL
  GROUP BY articulo_id, talla;

revoke all on public.vista_costo_promedio from anon;
