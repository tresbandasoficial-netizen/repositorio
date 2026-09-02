-- Migration 187: la cuenta entre sedes se agrega en SQL
--
-- Arregla dos hallazgos de la revisión de la 186:
--   1. Los pedidos CANCELADOS ya no cuentan (misma convención que
--      vista_ganancia_pedidos): un pedido cruzado cancelado inflaba la
--      deuda entre sedes para siempre.
--   2. El agregado en la app traía todas las filas con limit(10000) sin
--      order: al crecer el histórico (o con el Max Rows del Data API) el
--      acumulado se truncaba en silencio. La vista suma en la base y
--      devuelve pocas filas, exactas siempre.
--
-- de = sede cuya cuenta pagó la compra (cuenta global → TR, hub de compras);
-- para = sede del pedido al que está asignado el item. Solo cruces (de ≠ para).

create or replace view vista_entre_sedes as
select
  coalesce(sp.codigo, 'TR') as de,
  sd.codigo                 as para,
  sum(ci.costo_unitario_cop * ci.cantidad) as total,
  sum(ci.cantidad)          as unidades
from compra_items ci
join pedidos p  on p.id = ci.pedido_id
join sedes sd   on sd.id = p.sede_id
join compras c  on c.id = ci.compra_id
join cuentas cu on cu.id = c.cuenta_id   -- sin cuenta no se sabe de dónde salió la plata
left join sedes sp on sp.id = cu.sede_id
where p.estado != 'cancelado'
  and coalesce(sp.codigo, 'TR') != sd.codigo
group by 1, 2;

-- Costos de compra = información solo de admin; la página consulta con el
-- cliente de servicio. Nadie más la necesita (regla de la migración 111).
revoke all on vista_entre_sedes from anon, authenticated;
