-- Migration 134: Tabla alertas_recompra — registro de acciones de reactivación

create table alertas_recompra (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  segmento cliente_segmento_rfm not null,
  tipo text not null check (tipo in ('whatsapp_enviado', 'descuento_ofrecido', 'seguimiento', 'manual')),
  descripcion text,
  enviado_por uuid references usuarios(id),
  creado_en timestamp with time zone default now(),
  actualizado_en timestamp with time zone default now()
);

-- RLS: admin only (v1)
alter table alertas_recompra enable row level security;

create policy "alertas_recompra_admin_all" on alertas_recompra
  for all using (
    exists (select 1 from usuarios where usuarios.id = auth.uid() and usuarios.rol = 'admin')
  );

-- Índices
create index idx_alertas_recompra_cliente on alertas_recompra(cliente_id);
create index idx_alertas_recompra_segmento on alertas_recompra(segmento);
create index idx_alertas_recompra_creado_en on alertas_recompra(creado_en desc);
