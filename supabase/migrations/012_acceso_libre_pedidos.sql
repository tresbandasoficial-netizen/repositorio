-- Migration 012: acceso libre a pedidos entre sedes + transiciones libres
--
-- Cambios:
--   1. Asesores ven y editan pedidos de TODAS las sedes (no solo la propia)
--   2. Cambio de estado libre: cualquier no-terminal → cualquier otro estado
--   3. Cancelado ya no es exclusivo de admin

-- ── 1. Función cambiar_estado_pedido: transiciones libres ────────────────────

create or replace function cambiar_estado_pedido(
  p_pedido_id    uuid,
  p_nuevo_estado text,
  p_usuario_id   uuid
)
returns void
language plpgsql
security definer
as $$
declare
  v_estado_actual text;
begin
  select estado into v_estado_actual
  from pedidos
  where id = p_pedido_id
  for update;

  if not found then
    raise exception 'Pedido no encontrado: %', p_pedido_id;
  end if;

  -- Solo entregado y cancelado son terminales
  if v_estado_actual in ('entregado', 'cancelado') then
    raise exception 'El pedido está en estado "%", no se puede cambiar', v_estado_actual;
  end if;

  -- Validar que el nuevo estado sea un valor conocido
  if p_nuevo_estado not in (
    'pendiente','comprado','llego_usa','bodega_colombia',
    'avisado','en_sede','entregado','cancelado'
  ) then
    raise exception 'Estado desconocido: %', p_nuevo_estado;
  end if;

  if p_nuevo_estado = v_estado_actual then
    raise exception 'El pedido ya está en estado "%"', v_estado_actual;
  end if;

  update pedidos
  set estado = p_nuevo_estado
  where id = p_pedido_id;

  insert into historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id)
  values ('pedidos', p_pedido_id, 'estado', v_estado_actual, p_nuevo_estado, p_usuario_id);
end;
$$;

-- ── 2. RLS pedidos: todos los autenticados pueden leer y actualizar ───────────

drop policy if exists "pedidos_select" on pedidos;
create policy "pedidos_select" on pedidos
  for select using (auth.role() = 'authenticated');

drop policy if exists "pedidos_update" on pedidos;
create policy "pedidos_update" on pedidos
  for update using (auth.role() = 'authenticated');

-- ── 3. RLS pedido_items: todos los autenticados pueden leer ──────────────────

drop policy if exists "pedido_items_select" on pedido_items;
create policy "pedido_items_select" on pedido_items
  for select using (auth.role() = 'authenticated');

-- ── 4. RLS pagos: todos los autenticados pueden leer e insertar ──────────────

drop policy if exists "pagos_select" on pagos;
create policy "pagos_select" on pagos
  for select using (auth.role() = 'authenticated');

drop policy if exists "pagos_insert" on pagos;
create policy "pagos_insert" on pagos
  for insert with check (auth.role() = 'authenticated');

-- ── 5. RLS historial: todos los autenticados pueden leer ─────────────────────

drop policy if exists "historial_select" on historial_cambios;
create policy "historial_select" on historial_cambios
  for select using (auth.role() = 'authenticated');

-- ── 6. RLS alertas: todos los autenticados pueden leer ───────────────────────

drop policy if exists "alertas_select" on alertas;
create policy "alertas_select" on alertas
  for select using (auth.role() = 'authenticated');
