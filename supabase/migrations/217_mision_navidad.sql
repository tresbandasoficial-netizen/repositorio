-- Misión Navidad (Bucaramanga): meta de equipo de $650M entre el 1-nov y el 31-dic-2026.
-- Reglas del dueño (10-nov):
--   · SOLO cuenta lo facturado (la factura sale cuando el pedido se entrega) con fecha de
--     factura desde p_desde (los pedidos de octubre facturados en noviembre SÍ entran).
--   · El CRÉDITO no cuenta: son productos entregados que aún se deben. Cuenta lo ya PAGADO.
--   · p_excluir: asesores cuyas ventas no cuentan (cuenta "jhon fredy").
-- Esta función SOLO LEE; no modifica pedidos, facturas ni pagos.
--
-- Valor de una venta = pedidos.total (el total de la factura queda en $0 cuando el cliente ya
-- había pagado, por eso no se usa). Por factura:
--   pagado   = pagos de la factura + pagos de sus pedidos (sin anulados, sin método 'credito')
--   factor   = min(pagado, valor de sus pedidos) / valor de sus pedidos
--   cuenta   = pedidos.total × factor        (lo pagado)
--   crédito  = pedidos.total − cuenta        (lo que aún se debe; NO cuenta)
-- Se reparte entre las asesoras de la factura en proporción al valor de sus pedidos.
-- La plata que el cliente pague después sube lo que cuenta (acumulado, no por día de pago).
--
-- Devuelve por asesora:
--   facturado_total      → lo PAGADO de lo facturado (lo que cuenta para la meta)
--   facturado_bruto      → valor de lo facturado, pagado o no
--   credito              → facturado_bruto − facturado_total (entregado y aún debido)
--   facturado_de_antes   → de lo que cuenta, la parte de pedidos creados ANTES de p_desde
--   por_facturar         → pedidos creados en el rango que aún no se entregan/facturan

drop function if exists public.mision_navidad(text, date, date, uuid[]);
create or replace function public.mision_navidad(p_sede text, p_desde date, p_hasta date, p_excluir uuid[] default '{}')
returns table (
  asesor_id            uuid,
  asesor               text,
  facturado_n          int,
  facturado_total      numeric,
  facturado_bruto      numeric,
  credito              numeric,
  facturado_de_antes   numeric,
  por_facturar_n       int,
  por_facturar         numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with sede as (select id from sedes where codigo = p_sede),
  fx as (
    select f.id,
      coalesce((select sum(pf.monto) from pagos_factura pf
                 where pf.factura_id = f.id and not coalesce(pf.anulado, false) and pf.metodo <> 'credito'), 0)
      + coalesce((select sum(pg.monto) from pagos pg join pedidos pp on pp.id = pg.pedido_id
                   where pp.factura_id = f.id and not coalesce(pg.anulado, false) and pg.metodo <> 'credito'), 0) as pagado,
      (select coalesce(sum(p.total), 0) from pedidos p where p.factura_id = f.id and p.estado <> 'cancelado') as valor
    from facturas f
    where f.sede_id = (select id from sede)
      and f.estado <> 'anulada'
      and f.fecha_factura between p_desde and p_hasta
  ),
  fact as (
    select p.asesor_id,
           count(*)::int as n,
           sum(p.total) as bruto,
           sum(round(p.total * case when fx.valor > 0 then least(fx.pagado, fx.valor) / fx.valor else 0 end)) as pagado,
           coalesce(sum(round(p.total * case when fx.valor > 0 then least(fx.pagado, fx.valor) / fx.valor else 0 end))
                    filter (where (p.fecha_creacion at time zone 'America/Bogota')::date < p_desde), 0) as de_antes
    from pedidos p
    join fx on fx.id = p.factura_id
    where p.sede_id = (select id from sede)
      and p.estado <> 'cancelado'
      and not coalesce(p.asesor_id = any(p_excluir), false)
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
         coalesce(fact.pagado, 0),
         coalesce(fact.bruto, 0),
         coalesce(fact.bruto, 0) - coalesce(fact.pagado, 0),
         coalesce(fact.de_antes, 0),
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
