-- Migration 171: radio interno (reemplaza el chat de texto en la UI)
--
-- El admin habla por el micrófono y todos los empleados conectados lo escuchan
-- en su computador al instante (estilo walkie-talkie). Los audios se suben al
-- bucket público 'pedido-items' bajo radio/ y esta tabla lleva el registro; la
-- entrega instantánea va por Supabase Realtime igual que el chat (146).
-- El nombre del emisor se guarda en la fila porque usuarios_select solo deja
-- leer la fila propia (los asesores no podrían resolver el nombre del admin).
--
-- Solo el ADMIN transmite; todos los usuarios logueados escuchan.
-- La tabla mensajes_chat NO se toca (queda el histórico del chat viejo).

create table if not exists mensajes_radio (
  id            uuid primary key default gen_random_uuid(),
  emisor_id     uuid not null references usuarios(id),
  emisor_nombre text not null,
  audio_url     text not null,
  duracion_seg  integer check (duracion_seg is null or duracion_seg >= 0),
  creado_en     timestamptz not null default now()
);

alter table mensajes_radio enable row level security;

create policy radio_select on mensajes_radio for select to authenticated
  using (true);

create policy radio_insert on mensajes_radio for insert to authenticated
  with check (
    emisor_id = auth.uid()
    and exists (select 1 from usuarios u where u.id = auth.uid() and u.rol = 'admin')
  );

create policy radio_delete on mensajes_radio for delete to authenticated
  using (exists (select 1 from usuarios u where u.id = auth.uid() and u.rol = 'admin'));

create index idx_radio_creado on mensajes_radio(creado_en desc);

revoke all on mensajes_radio from anon;

-- Entrega instantánea vía Supabase Realtime (respeta RLS).
do $$
begin
  alter publication supabase_realtime add table mensajes_radio;
exception when duplicate_object then null;
end $$;
