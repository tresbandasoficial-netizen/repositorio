-- Migration 055: transformar tabla cuentas al nuevo modelo
-- La tabla cuentas ya existe desde migración 035.
-- Cambios:
--   - Reemplazar campo 'activa' (boolean) con 'estado' (text: 'activa'/'inactiva')
--   - Agregar campo 'actualizado_en'
--   - Actualizar tipo de datos para alinearse con nuevo schema

-- 1. Agregar campo 'estado' (si no existe)
do $$
begin
  alter table cuentas add column estado text default 'activa' check (estado in ('activa', 'inactiva'));
exception when duplicate_column then null;
end $$;

-- 2. Agregar 'actualizado_en' (si no existe)
do $$
begin
  alter table cuentas add column actualizado_en timestamptz default now();
exception when duplicate_column then null;
end $$;

-- 3. Migrar datos de 'activa' boolean a 'estado' text
-- Las cuentas que tienen activa=true quedan como 'activa'
-- Las que tienen activa=false quedan como 'inactiva'
update cuentas set estado = case when activa then 'activa' else 'inactiva' end
where estado = 'activa' and activa = false;

-- 4. Crear índices para queries de cuadre
create index if not exists idx_cuentas_estado on cuentas (estado);
create index if not exists idx_cuentas_sede on cuentas (sede_id);
