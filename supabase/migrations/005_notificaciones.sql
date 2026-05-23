-- Migration 005: tabla notificaciones + función procesar_alertas
--
-- FLUJO:
--   1. /api/cron/alertas llama a rpc('procesar_alertas')
--   2. La función materializa alertas activas y crea notificaciones
--   3. La ruta handler envía emails con Resend para cada notificación nueva
--
-- QUIÉN recibe notificación:
--   - El asesor del pedido
--   - Todos los usuarios con rol = 'admin'
--   (UNION garantiza que si el asesor es admin no se duplique)

-- ── Tabla ────────────────────────────────────────────────────────────────────
create table notificaciones (
  id            uuid primary key default uuid_generate_v4(),
  usuario_id    uuid not null references usuarios(id)  on delete cascade,
  alerta_id     uuid not null references alertas(id)   on delete cascade,
  leida         boolean not null default false,
  email_enviado boolean not null default false,
  creada_en     timestamptz not null default now(),
  unique (usuario_id, alerta_id)
);

create index idx_notificaciones_usuario on notificaciones (usuario_id) where leida = false;

-- ── Fix: el unique constraint de alertas permite múltiples NULLs en Postgres ─
-- El constraint original no previene duplicados activos (NULL != NULL).
-- Este partial unique index sí lo previene.
create unique index idx_alertas_activas_unica
  on alertas (pedido_id, tipo)
  where resuelta_en is null;

-- ── Función ──────────────────────────────────────────────────────────────────
-- Devuelve las notificaciones recién creadas con los datos que necesita
-- el handler de Next.js para enviar emails.
-- Si no hay alertas nuevas devuelve cero filas (sin error).
create or replace function procesar_alertas()
returns table (
  notificacion_id uuid,
  usuario_id      uuid,
  usuario_email   text,
  usuario_nombre  text,
  pedido_numero   text,
  pedido_estado   text,
  alerta_tipo     text
)
language plpgsql
security definer
as $$
begin
  return query
  with
  -- Pedidos que HOY tienen alerta activa según la vista
  pedidos_con_alerta as (
    select
      v.id             as pedido_id,
      v.numero_orden,
      v.estado,
      v.asesor_id,
      case when v.es_zombie then 'zombie' else 'tiempo_excedido' end as tipo_alerta
    from vista_pedidos_asesor v
    where v.en_alerta = true or v.es_zombie = true
  ),
  -- Insertar solo alertas que NO tienen ya una activa del mismo tipo
  nuevas_alertas as (
    insert into alertas (pedido_id, tipo)
    select pca.pedido_id, pca.tipo_alerta
    from pedidos_con_alerta pca
    where not exists (
      select 1 from alertas a
      where a.pedido_id = pca.pedido_id
        and a.tipo      = pca.tipo_alerta
        and a.resuelta_en is null
    )
    returning id, pedido_id, tipo
  ),
  -- Destinatarios: asesor del pedido
  dest_asesor as (
    select
      u.id    as usuario_id,
      u.email,
      u.nombre,
      na.id   as alerta_id,
      pca.numero_orden,
      pca.estado,
      na.tipo
    from nuevas_alertas na
    join pedidos_con_alerta pca on pca.pedido_id = na.pedido_id
    join usuarios u on u.id = pca.asesor_id
    where u.activo = true
  ),
  -- Destinatarios: todos los admins activos
  dest_admins as (
    select
      u.id    as usuario_id,
      u.email,
      u.nombre,
      na.id   as alerta_id,
      pca.numero_orden,
      pca.estado,
      na.tipo
    from nuevas_alertas na
    join pedidos_con_alerta pca on pca.pedido_id = na.pedido_id
    cross join usuarios u
    where u.rol = 'admin' and u.activo = true
  ),
  -- UNION elimina duplicados (cuando el asesor también es admin)
  todos_destinatarios as (
    select * from dest_asesor
    union
    select * from dest_admins
  ),
  -- Insertar notificaciones (ON CONFLICT DO NOTHING si ya existe)
  nuevas_nots as (
    insert into notificaciones (usuario_id, alerta_id)
    select td.usuario_id, td.alerta_id
    from todos_destinatarios td
    on conflict (usuario_id, alerta_id) do nothing
    returning id, usuario_id, alerta_id
  )
  select
    nn.id,
    nn.usuario_id,
    td.email,
    td.nombre,
    td.numero_orden,
    td.estado,
    td.tipo
  from nuevas_nots nn
  join todos_destinatarios td
    on td.usuario_id = nn.usuario_id
   and td.alerta_id  = nn.alerta_id;
end;
$$;
