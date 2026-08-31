-- Migration 185: sugerencias de asignación compra→pedido (por confirmar)
--
-- Antes, al crear un pedido, si había una compra "sin asignar" del mismo
-- artículo y talla, la compra se asignaba SOLA al pedido — y al marcar la
-- llegada de esa factura el pedido saltaba a 'bucaramanga' sin que nadie lo
-- revisara (caso TR7467). Ahora la coincidencia queda aquí como sugerencia
-- PENDIENTE y el admin la confirma o rechaza desde /compras. Solo al
-- confirmar se asigna la compra, sale el stock y avanza el estado.

create table if not exists asignaciones_pendientes (
  id                 uuid primary key default gen_random_uuid(),
  compra_item_id     uuid not null references compra_items(id) on delete cascade,
  pedido_id          uuid not null references pedidos(id) on delete cascade,
  pedido_item_indice int,
  estado             text not null default 'pendiente'
                     check (estado in ('pendiente', 'confirmada', 'rechazada')),
  creado_en          timestamptz not null default now(),
  resuelto_en        timestamptz,
  resuelto_por       uuid references usuarios(id),
  unique (compra_item_id, pedido_id)
);

create index if not exists asignaciones_pendientes_estado_idx
  on asignaciones_pendientes (estado) where estado = 'pendiente';

alter table asignaciones_pendientes enable row level security;

-- Solo admin: las sugerencias se crean desde el servidor (service role) y las
-- resuelve el admin en /compras.
drop policy if exists asignaciones_pendientes_admin on asignaciones_pendientes;
create policy asignaciones_pendientes_admin on asignaciones_pendientes for all
  using (auth_es_admin()) with check (auth_es_admin());

grant select, insert, update, delete on asignaciones_pendientes to authenticated;
revoke all on asignaciones_pendientes from anon;
