-- Migration 126: retos grupales (todos suman a una sola meta)
--
-- `modo`:
--   'individual' — cada participante debe llegar al objetivo (lo de la 125).
--   'grupal'     — el objetivo es UNO y lo suman todos entre sí; no hay
--                  ganador individual, la meta se logra o no.
--
-- El aporte de cada persona se sigue viendo con reto_avance(); esta migración
-- agrega reto_avance_grupo(), que da el total del equipo y el momento exacto
-- en que la suma cruzó la meta.

alter table retos
  add column if not exists modo text not null default 'individual';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'retos_modo_check'
  ) then
    alter table retos add constraint retos_modo_check
      check (modo in ('individual', 'grupal'));
  end if;
end $$;

create or replace function reto_avance_grupo(p_reto_id uuid)
returns table (
  valor         numeric,
  completado_en timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  r retos;
begin
  select * into r from retos where id = p_reto_id;
  if not found then
    return;
  end if;

  -- Mismo filtro de visibilidad que retos_select: al ser definer se salta el
  -- RLS, así que hay que repetirlo para no mostrar retos de otras sedes.
  if not (
    auth_es_admin()
    or cardinality(r.sedes) = 0
    or exists (
      select 1 from sedes s
      where s.id = auth_sede_id() and s.codigo = any (r.sedes)
    )
  ) then
    return;
  end if;

  return query
  with participantes as (
    select u.id
    from usuarios u
    left join sedes s on s.id = u.sede_id
    where u.activo
      and u.rol = 'asesor'
      and (cardinality(r.sedes) = 0 or s.codigo = any (r.sedes))
  ),
  -- Solo cuentan los pedidos de quienes compiten
  eventos as (
    select
      p.fecha_creacion as cuando,
      case r.metrica
        when 'ventas'  then p.total::numeric
        when 'pedidos' then 1::numeric
        else coalesce((
          select sum(pi.cantidad)
          from pedido_items pi
          left join articulos a on a.id = pi.articulo_id
          where pi.pedido_id = p.id
            and (r.categoria is null or a.categoria = r.categoria)
        ), 0)::numeric
      end as cuanto
    from pedidos p
    join participantes pa on pa.id = p.asesor_id
    where p.estado <> 'cancelado'
      and p.tipo <> 'saldo_anterior'
      and (p.fecha_creacion at time zone 'America/Bogota')::date between r.desde and r.hasta
  ),
  -- Suma corrida de TODO el equipo, para saber a qué hora se logró la meta
  acumulado as (
    select
      e.cuando,
      e.cuanto,
      sum(e.cuanto) over (
        order by e.cuando, e.cuanto
        rows between unbounded preceding and current row
      ) as corrido
    from eventos e
    where e.cuanto > 0
  )
  select
    coalesce((select sum(ac.cuanto) from acumulado ac), 0)::numeric,
    (select min(ac.cuando) from acumulado ac where ac.corrido >= r.objetivo);
end;
$$;

revoke all on function reto_avance_grupo(uuid) from public;
revoke all on function reto_avance_grupo(uuid) from anon;
grant execute on function reto_avance_grupo(uuid) to authenticated;
