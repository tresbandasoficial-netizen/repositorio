-- Descuentos a empleados por errores (prenda mal cobrada, faltante de caja,
-- envío equivocado...). El admin los registra y el total del mes se descuenta
-- en la nómina. El empleado puede VER los suyos (transparencia); solo el
-- admin crea/anula. Se anulan, no se borran (auditoría).
create table public.descuentos_empleados (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id),
  fecha date not null default (now() at time zone 'America/Bogota')::date,
  motivo text not null,
  valor integer not null check (valor > 0),
  pedido_ref text,
  anulado boolean not null default false,
  creado_por uuid references usuarios(id),
  creado_en timestamptz not null default now()
);

alter table public.descuentos_empleados enable row level security;

create policy descuentos_select on public.descuentos_empleados
  for select using (
    auth.uid() = usuario_id
    or exists (select 1 from usuarios u where u.id = auth.uid() and u.rol = 'admin')
  );

create policy descuentos_insert on public.descuentos_empleados
  for insert with check (
    exists (select 1 from usuarios u where u.id = auth.uid() and u.rol = 'admin')
  );

create policy descuentos_update on public.descuentos_empleados
  for update using (
    exists (select 1 from usuarios u where u.id = auth.uid() and u.rol = 'admin')
  );

-- Regla de la migración 111: anon sin acceso a objetos de negocio.
revoke all on public.descuentos_empleados from anon;
