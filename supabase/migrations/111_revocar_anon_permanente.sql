-- Migration 111: revocar (otra vez) el acceso de anon — y de forma permanente
--
-- La migración 092 revocó el acceso del rol anon, pero los permisos REGRESARON:
-- los privilegios por defecto de los roles creadores (postgres y supabase_admin)
-- conceden TODO a anon en cada tabla/vista/función nueva, así que cada migración
-- posterior a la 092 nació expuesta (envios, ajustes_caja, vistas de cartera,
-- RPCs nuevos...). Con la anon key pública se podía leer las vistas de negocio
-- y ejecutar funciones SECURITY DEFINER sin iniciar sesión.
--
-- Este arreglo repara el estado actual Y corrige los defaults del rol postgres
-- (el rol con el que se aplican las migraciones vía MCP), para que los objetos
-- futuros nazcan sin acceso anon. La app nunca consulta public sin sesión
-- (el login usa solo el esquema auth), así que no rompe nada.

-- 1. Reparar lo existente
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon;
revoke all on all sequences in schema public from anon;

-- 2. Corregir los privilegios por defecto del rol que crea los objetos (postgres)
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;

-- 3. Intentar lo mismo para supabase_admin (objetos internos); si el rol actual
--    no puede, se ignora — los objetos de la app los crea postgres.
do $$
begin
  execute 'alter default privileges for role supabase_admin in schema public revoke all on tables from anon';
  execute 'alter default privileges for role supabase_admin in schema public revoke execute on functions from anon';
  execute 'alter default privileges for role supabase_admin in schema public revoke all on sequences from anon';
exception when insufficient_privilege then
  raise notice 'sin permisos para alterar defaults de supabase_admin — omitido';
end $$;
