-- Migration 038: Control de pagos con mensajerías
--
-- Registra deudas (TB le debe al mensajero) y pagos (TB ya pagó).
-- SUM(deuda) - SUM(pago) = saldo pendiente con la mensajería.
--
-- Una deuda se genera automáticamente cuando se crea un domicilio
-- con tipo_cobro = 'tb_cobra' (el cliente paga a TB, TB paga al mensajero).

create table pagos_mensajeria (
  id             uuid        primary key default uuid_generate_v4(),
  mensajeria     text        not null check (mensajeria in ('exneider','movilenvios','otro')),
  tipo           text        not null check (tipo in ('deuda','pago')),
  monto          integer     not null check (monto > 0),
  fecha          date        not null default current_date,
  domicilio_id   uuid        references domicilios(id) on delete set null,
  cuenta_id      uuid        references cuentas(id),
  notas          text,
  responsable_id uuid        not null references usuarios(id),
  creado_en      timestamptz not null default now()
);

alter table pagos_mensajeria enable row level security;
create policy "pm_select" on pagos_mensajeria for select using (true);
create policy "pm_insert" on pagos_mensajeria for insert with check (auth.uid() is not null);
create policy "pm_update" on pagos_mensajeria for update using (
  exists (select 1 from usuarios where id = auth.uid() and rol = 'admin')
);
create policy "pm_delete" on pagos_mensajeria for delete using (
  exists (select 1 from usuarios where id = auth.uid() and rol = 'admin')
);

-- Ampliar el CHECK de mensajería en domicilios para incluir 'movilenvios'
alter table domicilios
  drop constraint if exists domicilios_mensajeria_check,
  add  constraint domicilios_mensajeria_check
    check (mensajeria in ('exneider','movilenvios','otro'));
