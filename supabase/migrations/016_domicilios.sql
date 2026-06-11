-- Migration 016: tabla domicilios
--
-- Registra domicilios diarios para enviar con mensajerías (Exneider / Servigo).
-- Vinculación opcional a un número de pedido.

create table domicilios (
  id                uuid        primary key default uuid_generate_v4(),
  fecha             date        not null default current_date,
  asesor_id         uuid        not null references usuarios(id) on delete restrict,
  cliente_nombre    text        not null,
  cliente_telefono  text,
  direccion         text        not null,
  mensajeria        text        not null check (mensajeria in ('exneider', 'servigo')),
  valor_domicilio   integer     not null default 0,
  cobrar_al_cliente boolean     not null default true,
  numero_pedido     text,
  notas             text,
  estado            text        not null default 'pendiente'
                                check (estado in ('pendiente', 'entregado')),
  creado_en         timestamptz not null default now()
);

create index idx_domicilios_fecha     on domicilios (fecha desc);
create index idx_domicilios_asesor    on domicilios (asesor_id);
create index idx_domicilios_mensajeria on domicilios (mensajeria, fecha desc);

alter table domicilios enable row level security;

-- Todos los usuarios autenticados ven, crean y editan domicilios
create policy "domicilios_select" on domicilios
  for select using (auth.role() = 'authenticated');

create policy "domicilios_insert" on domicilios
  for insert with check (auth.role() = 'authenticated');

create policy "domicilios_update" on domicilios
  for update using (auth.role() = 'authenticated');

create policy "domicilios_delete" on domicilios
  for delete using (auth.uid() = asesor_id
    or exists (
      select 1 from usuarios where id = auth.uid() and rol = 'admin'
    )
  );
