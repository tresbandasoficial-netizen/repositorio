-- Migration 007: RLS Fase 2 — policies restrictivas por rol y sede
--
-- MODELO DE ACCESO:
--   admin    → acceso total a todas las tablas
--   asesor   → solo datos de su sede asignada
--   clientes → compartidos (cualquier autenticado puede leer)
--   sedes    → solo lectura para todos
--
-- NOTA: las policies usan subqueries a 'usuarios' para obtener rol/sede_id
-- del usuario autenticado (auth.uid()). Esto es seguro y funciona con el
-- anon key normal; no requiere JWT claims personalizados.

-- ── Helpers (funciones para evitar repetición en policies) ────────────────────

create or replace function auth_es_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from usuarios
    where id = auth.uid() and rol = 'admin'
  )
$$;

create or replace function auth_sede_id()
returns uuid
language sql
security definer
stable
as $$
  select sede_id from usuarios where id = auth.uid()
$$;

-- ── Eliminar policies placeholder ────────────────────────────────────────────

drop policy if exists "auth_all_sedes"           on sedes;
drop policy if exists "auth_all_usuarios"        on usuarios;
drop policy if exists "auth_all_clientes"        on clientes;
drop policy if exists "auth_all_pedidos"         on pedidos;
drop policy if exists "auth_all_pedido_items"    on pedido_items;
drop policy if exists "auth_all_pagos"           on pagos;
drop policy if exists "auth_all_alertas"         on alertas;
drop policy if exists "auth_all_historial"       on historial_cambios;

-- ── SEDES: solo lectura para todos ───────────────────────────────────────────

create policy "sedes_select" on sedes
  for select using (auth.role() = 'authenticated');

-- ── USUARIOS: lectura propia + admin ve todo; escritura solo service_role ─────

create policy "usuarios_select" on usuarios
  for select using (
    auth.uid() = id
    or auth_es_admin()
  );

-- INSERT/UPDATE/DELETE van solo via service_role (invitarUsuarioAction)
-- No se necesita policy explícita si el service_role bypasea RLS.

-- ── CLIENTES: cualquier autenticado puede leer y escribir ────────────────────
-- Los clientes son entidades compartidas (pueden ser de cualquier sede).

create policy "clientes_all" on clientes
  for all using (auth.role() = 'authenticated');

-- ── PEDIDOS: asesor → solo su sede; admin → todo ─────────────────────────────

create policy "pedidos_select" on pedidos
  for select using (
    auth_es_admin()
    or sede_id = auth_sede_id()
  );

create policy "pedidos_insert" on pedidos
  for insert with check (
    auth_es_admin()
    or sede_id = auth_sede_id()
  );

create policy "pedidos_update" on pedidos
  for update using (
    auth_es_admin()
    or sede_id = auth_sede_id()
  );

-- DELETE no está permitido desde la aplicación (solo para migraciones/admin)

-- ── PEDIDO_ITEMS: hereda acceso del pedido padre ──────────────────────────────

create policy "pedido_items_select" on pedido_items
  for select using (
    exists (
      select 1 from pedidos p
      where p.id = pedido_id
        and (auth_es_admin() or p.sede_id = auth_sede_id())
    )
  );

create policy "pedido_items_insert" on pedido_items
  for insert with check (
    exists (
      select 1 from pedidos p
      where p.id = pedido_id
        and (auth_es_admin() or p.sede_id = auth_sede_id())
    )
  );

-- ── PAGOS: hereda acceso del pedido padre ────────────────────────────────────

create policy "pagos_select" on pagos
  for select using (
    exists (
      select 1 from pedidos p
      where p.id = pedido_id
        and (auth_es_admin() or p.sede_id = auth_sede_id())
    )
  );

create policy "pagos_insert" on pagos
  for insert with check (
    exists (
      select 1 from pedidos p
      where p.id = pedido_id
        and (auth_es_admin() or p.sede_id = auth_sede_id())
    )
  );

-- ── ALERTAS: hereda acceso del pedido padre ──────────────────────────────────

create policy "alertas_select" on alertas
  for select using (
    exists (
      select 1 from pedidos p
      where p.id = pedido_id
        and (auth_es_admin() or p.sede_id = auth_sede_id())
    )
  );

create policy "alertas_insert" on alertas
  for insert with check (auth_es_admin());

create policy "alertas_update" on alertas
  for update using (auth_es_admin());

-- ── HISTORIAL: hereda acceso del pedido padre ────────────────────────────────

create policy "historial_select" on historial_cambios
  for select using (
    exists (
      select 1 from pedidos p
      where p.id = registro_id
        and (auth_es_admin() or p.sede_id = auth_sede_id())
    )
  );

create policy "historial_insert" on historial_cambios
  for insert with check (auth.role() = 'authenticated');

-- ── NOTIFICACIONES: solo el propio usuario ────────────────────────────────────

alter table notificaciones enable row level security;

create policy "notificaciones_select" on notificaciones
  for select using (usuario_id = auth.uid() or auth_es_admin());

create policy "notificaciones_update" on notificaciones
  for update using (usuario_id = auth.uid() or auth_es_admin());

create policy "notificaciones_insert" on notificaciones
  for insert with check (auth_es_admin());
