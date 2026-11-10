-- Misión Navidad (Bucaramanga): meta de equipo de $650M entre el 1-nov y el 31-dic-2026.
-- Regla del dueño: SOLO cuenta lo facturado (la factura sale cuando el pedido se entrega).
-- p_excluir: asesores cuyas ventas NO cuentan (jhon fredy, por decisión del dueño, 10-nov).
-- Esta función SOLO LEE; no modifica pedidos, facturas ni pagos.
--
-- Valor de una venta = pedidos.total de los pedidos que cubre la factura (el total de
-- la factura queda en $0 cuando el cliente ya había pagado, por eso no se usa).
-- La venta es de la asesora del PEDIDO. Quedan fuera pedidos cancelados y facturas anuladas.
--
-- Devuelve por asesora:
--   facturado_total      → pedidos facturados con fecha de factura dentro del rango
--   facturado_de_antes   → de ese total, lo que se creó ANTES de p_desde (ventas de octubre)
--   creados_facturados   → pedidos creados dentro del rango y ya facturados
--   por_facturar         → pedidos creados en el rango que aún no se entregan/facturan

drop function if exists public.mision_navidad(text, date, date);
create or replace function public.mision_navidad(p_sede text, p_desde date, p_hasta date, p_excluir uuid[] default '{}')
returns table (
  asesor_id            uuid,
  asesor               text,
  facturado_n          int,
  facturado_total      numeric,
  facturado_de_antes   numeric,
  creados_facturados   numeric,
  por_facturar_n       int,
  por_facturar         numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with sede as (select id from sedes where codigo = p_sede),
  fact as (
    select p.asesor_id,
           count(*)::int as n,
           sum(p.total) as total,
           coalesce(sum(p.total) filter (where (p.fecha_creacion at time zone 'America/Bogota')::date < p_desde), 0) as de_antes,
           coalesce(sum(p.total) filter (where (p.fecha_creacion at time zone 'America/Bogota')::date >= p_desde), 0) as creados
    from pedidos p
    join facturas f on f.id = p.factura_id
    where p.sede_id = (select id from sede)
      and f.estado <> 'anulada'
      and p.estado <> 'cancelado'
      and not coalesce(p.asesor_id = any(p_excluir), false)
      and f.fecha_factura between p_desde and p_hasta
    group by p.asesor_id
  ),
  pend as (
    select p.asesor_id, count(*)::int as n, sum(p.total) as total
    from pedidos p
    where p.sede_id = (select id from sede)
      and p.estado <> 'cancelado'
      and not coalesce(p.asesor_id = any(p_excluir), false)
      and (p.fecha_creacion at time zone 'America/Bogota')::date between p_desde and p_hasta
      and (p.factura_id is null or exists (select 1 from facturas f where f.id = p.factura_id and f.estado = 'anulada'))
    group by p.asesor_id
  )
  select coalesce(fact.asesor_id, pend.asesor_id),
         coalesce(u.nombre, 'Sin asesor'),
         coalesce(fact.n, 0),
         coalesce(fact.total, 0),
         coalesce(fact.de_antes, 0),
         coalesce(fact.creados, 0),
         coalesce(pend.n, 0),
         coalesce(pend.total, 0)
  from fact
  full join pend on coalesce(pend.asesor_id, '00000000-0000-0000-0000-000000000000'::uuid)
                  = coalesce(fact.asesor_id, '00000000-0000-0000-0000-000000000000'::uuid)
  left join usuarios u on u.id = coalesce(fact.asesor_id, pend.asesor_id)
  order by 4 desc;
$$;

revoke all on function public.mision_navidad(text, date, date, uuid[]) from public, anon, authenticated;
grant execute on function public.mision_navidad(text, date, date, uuid[]) to service_role;
