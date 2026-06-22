-- Migration 037: Tabla de gastos operacionales
--
-- Registra egresos del negocio (nómina, arriendo, publicidad, etc.).
-- origen / origen_id rastrean si el gasto fue generado automáticamente
-- por una compra de mercancía o por un domicilio regalado.

create table gastos (
  id             uuid        primary key default uuid_generate_v4(),
  fecha          date        not null default current_date,
  valor          integer     not null check (valor > 0),
  categoria      text        not null check (categoria in (
                   'compras_mercancia','domicilios','publicidad','nomina',
                   'arriendo','servicios','transporte','papeleria','otros'
                 )),
  sede_id        uuid        not null references sedes(id),
  cuenta_id      uuid        references cuentas(id),
  responsable_id uuid        not null references usuarios(id),
  observacion    text,
  origen         text        check (origen in ('manual','compra','domicilio')),
  origen_id      uuid,
  creado_en      timestamptz not null default now()
);

alter table gastos enable row level security;
create policy "gastos_select" on gastos for select using (true);
create policy "gastos_insert" on gastos for insert with check (auth.uid() is not null);
create policy "gastos_update" on gastos for update using (
  exists (select 1 from usuarios where id = auth.uid() and rol = 'admin')
);
create policy "gastos_delete" on gastos for delete using (
  exists (select 1 from usuarios where id = auth.uid() and rol = 'admin')
);
