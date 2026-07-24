-- Migration 125: retos de ventas para los asesores
--
-- El admin crea un reto ("hoy cada uno 10 pares de zapatos, bono de $50.000 al
-- primero que los complete"), con premio y foto del premio. El avance se
-- calcula solo desde los pedidos: nadie marca nada a mano.
--
-- `sedes` (códigos TR/SR/CR) define quiénes compiten Y quiénes lo ven: un reto
-- de Bucaramanga y Santa Rosa no le aparece a Cúcuta. Vacío = todas las sedes.
-- El admin ve todos los retos siempre.

create table if not exists retos (
  id          uuid primary key default gen_random_uuid(),
  titulo      text not null,
  descripcion text,
  -- Qué se mide. 'unidades' puede además filtrar por categoría de artículo
  -- (categoria='tenis' = pares de zapatos).
  metrica     text not null check (metrica in ('ventas', 'pedidos', 'unidades')),
  categoria   text check (categoria in ('ropa', 'tenis', 'accesorios')),
  objetivo    numeric not null check (objetivo > 0),
  sedes       text[] not null default '{}',
  premio      text,
  imagen_url  text,
  desde       date not null,
  hasta       date not null,
  activo      boolean not null default true,
  creado_por  uuid references usuarios(id),
  creado_en   timestamptz not null default now(),
  check (hasta >= desde),
  -- La categoría solo tiene sentido contando unidades
  check (categoria is null or metrica = 'unidades')
);

create index if not exists idx_retos_activo on retos (activo, desde desc);

alter table retos enable row level security;

-- Lo ve el admin, y los asesores de las sedes que compiten (nadie más).
drop policy if exists retos_select on retos;
create policy retos_select on retos for select
  using (
    auth_es_admin()
    or cardinality(sedes) = 0
    or exists (
      select 1 from sedes s
      where s.id = auth_sede_id() and s.codigo = any (retos.sedes)
    )
  );

-- Solo el admin los crea, edita y borra.
drop policy if exists retos_insert on retos;
create policy retos_insert on retos for insert with check (auth_es_admin());
drop policy if exists retos_update on retos;
create policy retos_update on retos for update using (auth_es_admin()) with check (auth_es_admin());
drop policy if exists retos_delete on retos;
create policy retos_delete on retos for delete using (auth_es_admin());

grant select, insert, update, delete on retos to authenticated;
revoke all on retos from anon;

-- ── Avance del reto ─────────────────────────────────────────────────────────
-- SECURITY DEFINER porque el asesor NO puede leer la tabla usuarios más que su
-- propia fila (política usuarios_select), y el ranking necesita el nombre y la
-- sede de todos los que compiten. Devuelve solo eso: nombre, sede, cuánto
-- lleva y a qué hora completó la meta (null si aún no).
--
-- Al ser definer se salta el RLS, así que repite el mismo filtro de
-- visibilidad de retos_select: quien no compite ni es admin no recibe nada.
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
  ),
  -- Cada pedido aporta al reto según la métrica, con la hora en que se creó
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
  -- Suma corrida por asesor, para saber en qué venta exacta cruzó la meta
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

revoke all on function reto_avance(uuid) from public;
revoke all on function reto_avance(uuid) from anon;
grant execute on function reto_avance(uuid) to authenticated;
