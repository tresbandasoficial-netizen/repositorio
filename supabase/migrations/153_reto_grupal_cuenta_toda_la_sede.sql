-- Migration 153: la meta grupal es de la TIENDA, no solo de los asesores
--
-- Antes reto_avance_grupo() solo sumaba pedidos de usuarios rol='asesor'.
-- Pedido de Johan: las ventas que registran los administradores también ayudan
-- a la meta de la sede. Ahora el avance grupal suma TODOS los pedidos de las
-- sedes del reto, sin importar el rol de quien los puso.
--
-- Los retos individuales (reto_avance) siguen midiendo solo a los asesores.

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
  -- Cuentan TODOS los pedidos de las sedes del reto (asesores y admins):
  -- la meta grupal es de la tienda completa.
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
      and (p.fecha_creacion at time zone 'America/Bogota')::date between r.desde and r.hasta
  ),
  -- Suma corrida de toda la tienda, para saber a qué hora se logró la meta
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
