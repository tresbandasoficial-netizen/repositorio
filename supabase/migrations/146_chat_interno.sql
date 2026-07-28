-- Migración 146: chat interno entre usuarios
--
-- Mensajes directos 1 a 1 para preguntarse por pedidos y demás. Sin canales ni
-- grupos en v1: con un equipo de este tamaño, lo directo resuelve.

create table mensajes_chat (
  id           uuid primary key default gen_random_uuid(),
  de_usuario   uuid not null references usuarios(id),
  para_usuario uuid not null references usuarios(id),
  texto        text not null check (length(trim(texto)) between 1 and 2000),
  leido        boolean not null default false,
  creado_en    timestamptz not null default now()
);

alter table mensajes_chat enable row level security;

-- Solo los dos participantes ven la conversación.
create policy chat_select on mensajes_chat
  for select using (auth.uid() in (de_usuario, para_usuario));

-- Solo se puede enviar COMO uno mismo, y no a uno mismo.
create policy chat_insert on mensajes_chat
  for insert with check (de_usuario = auth.uid() and para_usuario <> auth.uid());

-- Solo el destinatario marca como leído (es el único update que existe).
create policy chat_update on mensajes_chat
  for update using (para_usuario = auth.uid()) with check (para_usuario = auth.uid());

create index idx_chat_bandeja on mensajes_chat(para_usuario, leido) where not leido;
create index idx_chat_conversacion on mensajes_chat(de_usuario, para_usuario, creado_en);

-- Entrega instantánea vía Supabase Realtime (respeta RLS).
do $$
begin
  alter publication supabase_realtime add table mensajes_chat;
exception when duplicate_object then null;
end $$;

-- Con quién se puede chatear. Es SECURITY DEFINER porque usuarios_select solo
-- deja al asesor leer su propia fila (igual que en retos): sin esto una asesora
-- no vería a nadie en la lista. Devuelve solo lo mínimo: id, nombre y rol de
-- los usuarios activos que no son visores.
create or replace function chat_usuarios()
returns table (id uuid, nombre text, rol text)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.nombre, u.rol
  from usuarios u
  where u.activo = true
    and u.rol in ('admin', 'asesor')
    and u.id <> auth.uid()
  order by u.nombre;
$$;

-- Regla de la migración 111: anon no toca nada de esto.
revoke all on mensajes_chat from anon;
revoke all on function chat_usuarios() from anon;
grant execute on function chat_usuarios() to authenticated;
