alter table pedido_items add column if not exists imagen_url text;

insert into storage.buckets (id, name, public)
values ('pedido-items', 'pedido-items', true)
on conflict (id) do nothing;

create policy "Autenticados pueden subir imagenes de productos" on storage.objects
  for insert to authenticated with check (bucket_id = 'pedido-items');

create policy "Imagenes de productos son publicas" on storage.objects
  for select using (bucket_id = 'pedido-items');

create policy "Autenticados pueden eliminar imagenes de productos" on storage.objects
  for delete to authenticated using (bucket_id = 'pedido-items');
