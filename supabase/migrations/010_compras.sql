-- compras: cabecera de cada factura de compra
create table compras (
  id          uuid primary key default uuid_generate_v4(),
  tipo        text not null check (tipo in ('usa', 'colombia')),
  proveedor   text not null,
  fecha       date not null default current_date,
  total_usd   numeric(10,2),        -- solo si tipo = usa
  trm         numeric(10,2),        -- solo si tipo = usa
  total_cop   integer not null,     -- siempre en COP
  notas       text,
  creado_por  uuid not null references usuarios(id),
  creado_en   timestamptz not null default now()
);

create index idx_compras_fecha on compras (fecha desc);
create index idx_compras_tipo  on compras (tipo);

-- compra_items: cada producto dentro de una compra
create table compra_items (
  id                 uuid primary key default uuid_generate_v4(),
  compra_id          uuid not null references compras(id) on delete cascade,
  descripcion        text not null,
  marca              text,
  talla              text,
  cantidad           integer not null check (cantidad > 0),
  costo_unitario_cop integer not null check (costo_unitario_cop >= 0),
  destino            text not null default 'sin_asignar'
                     check (destino in ('pedido', 'contoda', 'sin_asignar')),
  pedido_id          uuid references pedidos(id),
  transferido_contoda boolean not null default false,
  transferido_en     timestamptz,
  creado_en          timestamptz not null default now()
);

create index idx_compra_items_compra  on compra_items (compra_id);
create index idx_compra_items_pedido  on compra_items (pedido_id);
create index idx_compra_items_destino on compra_items (destino) where transferido_contoda = false;

-- RLS: solo admin accede
alter table compras      enable row level security;
alter table compra_items enable row level security;

create policy "compras_admin"      on compras      for all using (auth_es_admin());
create policy "compra_items_admin" on compra_items for all using (auth_es_admin());
