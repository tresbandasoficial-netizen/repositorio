-- Migration 154: retos dirigidos a personas específicas
--
-- `retos.usuarios` (uuid[], default vacío): si tiene ids, el reto SOLO aplica a
-- esos usuarios — el ranking individual no muestra a nadie más y el avance
-- grupal solo suma los pedidos de ellos. Vacío = comportamiento de siempre
-- (todos los asesores de las sedes del reto; en grupal, toda la tienda).
--
-- Pedido por Johan: la meta personal de agosto es solo de Jhon Fredy y Ximena
-- ($200M c/u) — sin este filtro, Ronaldo y Johan (asesores TR) saldrían en ese
-- ranking sin quererlo.

alter table retos add column if not exists usuarios uuid[] not null default '{}';

-- ── reto_avance: ranking individual, ahora filtrable por usuarios ────────────
create or replace function reto_avance(p_reto_id uuid)
returns table (
  usuario_id    uuid,
  nombre        text,
  sede          text,
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
    select u.id, u.nombre, coalesce(s.codigo, '—') as sede
    from usuarios u
    left join sedes s on s.id = u.sede_id
    where u.activo
      and u.rol = 'asesor'
      and (cardinality(r.sedes) = 0 or s.codigo = any (r.sedes))
      -- Reto dirigido: solo los usuarios señalados
      and (cardinality(r.usuarios) = 0 or u.id = any (r.usuarios))
  ),
  eventos as (
    select
      p.asesor_id,
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
    where p.estado <> 'cancelado'
      and p.tipo <> 'saldo_anterior'
      and (p.fecha_creacion at time zone 'America/Bogota')::date between r.desde and r.hasta
  ),
  acumulado as (
    select
      e.asesor_id,
      e.cuando,
      e.cuanto,
      sum(e.cuanto) over (
        partition by e.asesor_id
        order by e.cuando, e.cuanto
        rows between unbounded preceding and current row
      ) as corrido
    from eventos e
    where e.cuanto > 0
  )
  select
    pa.id,
    pa.nombre,
    pa.sede,
    coalesce((select sum(ac.cuanto) from acumulado ac where ac.asesor_id = pa.id), 0)::numeric,
    (select min(ac.cuando) from acumulado ac
      where ac.asesor_id = pa.id and ac.corrido >= r.objetivo)
  from participantes pa;
end;
$$;

-- ── reto_avance_grupo: usuarios definidos = solo sus pedidos; vacío = tienda ─
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
  -- Sin usuarios: cuentan TODOS los pedidos de las sedes del reto (asesores y
  -- admins — la meta grupal es de la tienda completa, migración 153). Con
  -- usuarios: solo los pedidos de esas personas.
  with eventos as (
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
    join sedes sd on sd.id = p.sede_id
    where p.estado <> 'cancelado'
      and p.tipo <> 'saldo_anterior'
      and (cardinality(r.sedes) = 0 or sd.codigo = any (r.sedes))
      and (cardinality(r.usuarios) = 0 or p.asesor_id = any (r.usuarios))
      and (p.fecha_creacion at time zone 'America/Bogota')::date between r.desde and r.hasta
  ),
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
