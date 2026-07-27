-- Migración 137: el segmento RFM se calcula en la vista, no se guarda quieto
--
-- Dos defectos de la implementación original (131–135):
--
-- 1. EL SEGMENTO GUARDADO SE QUEDABA VIEJO. clientes.segmento_rfm solo se
--    recalculaba por trigger de pedidos/pagos_factura, pero la recencia cambia
--    con el paso del tiempo, no con una escritura: quien compró hace 60 días
--    pasa a 61 mañana sin que nadie toque la base, y su segmento no se movía.
--    Encontrados 35 clientes marcados 'nuevo'/'leal' que ya eran 'en_riesgo'.
--    Se decidió tiempo real, así que el segmento vive en la vista y no puede
--    quedar viejo; la columna queda solo para filtrar e historiar.
--
-- 2. 'perdido' ERA INALCANZABLE. La rama de 'dormido' (dias > 180) estaba antes
--    de la de 'perdido', que pedía la misma condición más frecuencia baja, así
--    que nunca se llegaba. Ahora 'perdido' va primero, como se acordó:
--    "Perdido = dormido que nunca fue frecuente".
--
-- Umbrales sin cambios (aprobados por el usuario): R 60/180 días,
-- F 3+/2/1 compras, M $3.000.000 en 365 días.

create or replace view vista_rfm_clientes as
with hoy_bogota as (
  select (now() at time zone 'America/Bogota')::date as fecha
),
pedidos_validos as (
  select
    p.cliente_id,
    p.id as pedido_id,
    p.total,
    p.fecha_creacion,
    p.factura_id
  from pedidos p
  where p.estado != 'cancelado'
    and p.cliente_id is not null
),
pagos_pedidos as (
  select p.pedido_id, sum(p.monto) as monto_pagado
  from pagos p
  where p.anulado = false and p.metodo != 'credito'
  group by p.pedido_id
),
pagos_facturas as (
  select f.id as factura_id, sum(pf.monto) as monto_pagado
  from pagos_factura pf
  join facturas f on f.id = pf.factura_id
  where pf.anulado = false and pf.metodo != 'credito'
  group by f.id
),
ventas_365 as (
  select
    pv.cliente_id,
    max(pv.fecha_creacion) as ultima_compra,
    count(distinct pv.pedido_id) as num_compras,
    coalesce(sum(coalesce(pp.monto_pagado, 0)) + sum(coalesce(pf.monto_pagado, 0)), 0) as total_pagado
  from pedidos_validos pv
  left join pagos_pedidos  pp on pv.pedido_id = pp.pedido_id
  left join pagos_facturas pf on pv.factura_id = pf.factura_id
  where pv.fecha_creacion >= ((now() at time zone 'America/Bogota')::date - interval '365 days')
  group by pv.cliente_id
),
rfm as (
  select
    c.id as cliente_id,
    c.nombre,
    c.telefono_normalizado,
    v.ultima_compra,
    ((select fecha from hoy_bogota) - v.ultima_compra::date) as dias_desde_ultima_compra,
    v.num_compras as frecuencia,
    v.total_pagado as monto_total
  from clientes c
  left join ventas_365 v on c.id = v.cliente_id
)
select
  r.*,
  (case
     -- Sin recencia = sin compra en 365 días: se trata como 999 días.
     when coalesce(r.dias_desde_ultima_compra, 999) <= 60
          and coalesce(r.frecuencia, 0) >= 3
          and coalesce(r.monto_total, 0) >= 3000000            then 'campeon'
     when coalesce(r.dias_desde_ultima_compra, 999) <= 60
          and coalesce(r.frecuencia, 0) >= 3                   then 'leal'
     -- Compraba seguido y en volumen, pero se alejó: vale reactivarlo.
     when coalesce(r.dias_desde_ultima_compra, 999) > 60
          and coalesce(r.frecuencia, 0) >= 3
          and coalesce(r.monto_total, 0) >= 3000000            then 'potencial'
     when coalesce(r.dias_desde_ultima_compra, 999) <= 60
          and coalesce(r.frecuencia, 0) = 1                    then 'nuevo'
     -- 'perdido' ANTES de 'dormido': ambos piden > 180 días y el orden decide.
     when coalesce(r.dias_desde_ultima_compra, 999) > 180
          and coalesce(r.frecuencia, 0) <= 1                   then 'perdido'
     when coalesce(r.dias_desde_ultima_compra, 999) > 180      then 'dormido'
     when coalesce(r.dias_desde_ultima_compra, 999) between 61 and 180 then 'en_riesgo'
     else 'nuevo'
   end)::cliente_segmento_rfm as segmento
from rfm r;

-- El RPC pasa a leer el segmento de la vista: una sola fuente de verdad, para
-- que el trigger y la pantalla no puedan discrepar.
create or replace function calcular_segmento_rfm(p_cliente_id uuid)
returns cliente_segmento_rfm
language plpgsql
security definer
set search_path = public
as $$
declare
  v_segmento cliente_segmento_rfm;
begin
  select segmento into v_segmento
  from vista_rfm_clientes
  where cliente_id = p_cliente_id;

  return coalesce(v_segmento, 'nuevo'::cliente_segmento_rfm);
end;
$$;

revoke all on function calcular_segmento_rfm(uuid) from anon;
grant execute on function calcular_segmento_rfm(uuid) to authenticated;

-- La vista es de negocio: solo usuarios con sesión (regla de la migración 111).
revoke all on vista_rfm_clientes from anon;
grant select on vista_rfm_clientes to authenticated;

-- Poner al día lo ya guardado (los 35 que quedaron viejos).
update clientes c
set segmento_rfm = v.segmento
from vista_rfm_clientes v
where v.cliente_id = c.id
  and c.segmento_rfm is distinct from v.segmento;
