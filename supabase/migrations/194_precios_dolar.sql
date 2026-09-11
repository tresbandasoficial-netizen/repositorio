-- Precios dólar (sección Equipo): lista de tipos de artículo con su valor en
-- USD. El admin mantiene la lista y la TRM del día; los asesores la consultan
-- y ven el precio en pesos calculado con la fórmula del negocio:
--   pesos = USD × 1.07 (tax 7%) × 1.40 (ganancia 40%) × TRM
-- El cálculo se hace en la app (un solo lugar: lib), aquí solo viven los datos.
create table public.precios_dolar (
  id uuid primary key default gen_random_uuid(),
  tipo_articulo text not null,
  valor_usd numeric(10,2) not null check (valor_usd > 0),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- Configuración global clave→valor. Primera clave: trm_dolar (valor del dólar
-- que el admin actualiza). Reutilizable para futuros ajustes globales sin
-- crear más tablas.
create table public.configuracion (
  clave text primary key,
  valor text not null,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references usuarios(id)
);

insert into public.configuracion (clave, valor) values ('trm_dolar', '4000');

-- RLS: cualquier usuario autenticado LEE (asesores consultan precios);
-- solo el admin escribe.
alter table public.precios_dolar enable row level security;

create policy precios_dolar_select on public.precios_dolar
  for select using (auth.uid() is not null);

create policy precios_dolar_insert on public.precios_dolar
  for insert with check (
    exists (select 1 from usuarios u where u.id = auth.uid() and u.rol = 'admin')
  );

create policy precios_dolar_update on public.precios_dolar
  for update using (
    exists (select 1 from usuarios u where u.id = auth.uid() and u.rol = 'admin')
  );

create policy precios_dolar_delete on public.precios_dolar
  for delete using (
    exists (select 1 from usuarios u where u.id = auth.uid() and u.rol = 'admin')
  );

alter table public.configuracion enable row level security;

create policy configuracion_select on public.configuracion
  for select using (auth.uid() is not null);

create policy configuracion_insert on public.configuracion
  for insert with check (
    exists (select 1 from usuarios u where u.id = auth.uid() and u.rol = 'admin')
  );

create policy configuracion_update on public.configuracion
  for update using (
    exists (select 1 from usuarios u where u.id = auth.uid() and u.rol = 'admin')
  );

-- Regla de la migración 111: anon sin acceso a objetos de negocio.
revoke all on public.precios_dolar from anon;
revoke all on public.configuracion from anon;
