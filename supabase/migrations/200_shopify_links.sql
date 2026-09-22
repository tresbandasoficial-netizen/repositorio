-- Migración 200: links de Shopify por pedido ("Pedido por Link")
--
-- Flujo ADITIVO (el de toma de pedidos no se toca): para un cliente NUEVO la
-- asesora crea el pedido en versión corta (celular + artículo), genera un
-- link de borrador de Shopify con el producto/precio montados, y el cliente
-- llena SUS datos en el checkout. Cuando confirma, el webhook marca la fila
-- como confirmada y completa la ficha del cliente.
--
-- Tabla aparte de pedidos a propósito: no toca vistas ni flujos existentes.
-- Escrituras SOLO del server (service_role: acción admin/asesor y webhook);
-- los asesores leen para ver el link y su estado.

create table shopify_links (
  id                 uuid primary key default gen_random_uuid(),
  pedido_id          uuid not null references pedidos(id) on delete cascade,
  draft_id           text not null,     -- gid://shopify/DraftOrder/…
  draft_name         text,              -- #D12
  invoice_url        text not null,
  estado             text not null default 'pendiente' check (estado in ('pendiente','confirmado')),
  shopify_order_id   text,
  shopify_order_name text,              -- #1027
  datos_cliente      jsonb,             -- lo que llenó el cliente (auditoría)
  creado_por         uuid references usuarios(id) on delete set null,
  creado_en          timestamptz not null default now(),
  confirmado_en      timestamptz
);

-- Un solo link PENDIENTE por pedido: repetir el clic devuelve el mismo link.
create unique index shopify_links_pendiente_unico
  on shopify_links(pedido_id) where estado = 'pendiente';
create index idx_shopify_links_pedido on shopify_links(pedido_id);

alter table shopify_links enable row level security;
create policy shopify_links_select on shopify_links
  for select to authenticated using (auth_no_es_visor());
-- Sin policies de escritura para authenticated: inserta/actualiza solo el
-- server con service_role.
revoke all on shopify_links from anon;
grant select on shopify_links to authenticated;
