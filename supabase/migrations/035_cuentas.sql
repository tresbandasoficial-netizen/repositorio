-- Migration 035: Tabla de cuentas financieras
--
-- Registra dónde entra y sale el dinero físicamente.
-- Cada pago, gasto o compra queda asociado a una cuenta.

create table cuentas (
  id          uuid        primary key default uuid_generate_v4(),
  nombre      text        not null unique,
  tipo        text        not null check (tipo in (
                'bancolombia','nequi','daviplata',
                'efectivo','addi','sistecredito','bold','credito','otro'
              )),
  metodo_pago text,       -- MetodoPago equivalente para compatibilidad con pagos históricos
  sede_id     uuid        references sedes(id),
  activa      boolean     not null default true,
  orden       integer     not null default 0,
  creado_en   timestamptz not null default now()
);

alter table cuentas enable row level security;
create policy "cuentas_read"  on cuentas for select using (true);
create policy "cuentas_admin" on cuentas for all    using (
  exists (select 1 from usuarios where id = auth.uid() and rol = 'admin')
);

-- Cuentas iniciales
insert into cuentas (nombre, tipo, metodo_pago, orden) values
  ('Bancolombia Ronaldo',    'bancolombia', 'bancolombia_ronaldo',   1),
  ('Bancolombia Tres Bandas','bancolombia', 'bancolombia',           2),
  ('Bancolombia Johan',      'bancolombia', 'bancolombia_johan',     3),
  ('Bancolombia Carlos',     'bancolombia', 'bancolombia_carlos',    4),
  ('Bancolombia Cristian',   'bancolombia', 'bancolombia_cristian',  5),
  ('Bancolombia Huber',      'bancolombia', 'bancolombia_huber',     6),
  ('Nequi Johan',            'nequi',       'nequi_johan',           7),
  ('Nequi Marisol',          'nequi',       'nequi_marisol',         8),
  ('Nequi Luisa Santa Rosa', 'nequi',       'nequi_luisa',           9),
  ('Nequi Tres Bandas',      'nequi',       'nequi',                 10),
  ('Daviplata',              'daviplata',   'davivienda',            11),
  ('Addi',                   'addi',        'addi',                  12),
  ('Sistecrédito',           'sistecredito','sistecredito',          13),
  ('Bold',                   'bold',        'bold',                  14),
  ('Crédito',                'credito',     'credito',               15);

insert into cuentas (nombre, tipo, metodo_pago, sede_id, orden)
select 'Caja Bucaramanga', 'efectivo', 'efectivo', id, 16 from sedes where codigo = 'TR';
insert into cuentas (nombre, tipo, metodo_pago, sede_id, orden)
select 'Caja Cúcuta',      'efectivo', 'efectivo', id, 17 from sedes where codigo = 'CR';
insert into cuentas (nombre, tipo, metodo_pago, sede_id, orden)
select 'Caja Santa Rosa',  'efectivo', 'efectivo', id, 18 from sedes where codigo = 'SR';
