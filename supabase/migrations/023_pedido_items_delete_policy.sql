-- Permite eliminar items de pedidos propios de la sede
create policy "pedido_items_delete" on pedido_items
  for delete using (
    exists (
      select 1 from pedidos p
      where p.id = pedido_id
        and (auth_es_admin() or p.sede_id = auth_sede_id())
    )
  );
