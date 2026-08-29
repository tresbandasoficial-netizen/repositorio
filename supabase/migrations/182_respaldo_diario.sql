-- Migration 182: respaldo automático diario de toda la base de datos
--
-- pg_cron llama cada día a las 08:00 UTC (3:00 a.m. Bogotá) a la edge
-- function `respaldo` (desplegada por fuera del repo), que vuelca todas las
-- tablas de public + usuarios de auth a un JSON en el bucket privado
-- 'respaldos' (conserva 60 días). El respaldo también se puede descargar al
-- computador con ?accion=descargar (script en Documentos\Respaldos Tres Bandas).
--
-- ⚠️ El repo es PÚBLICO: el token real NO va aquí. La versión aplicada a la BD
-- (vía apply_migration) lleva el token y el anon key reales; este archivo es
-- la constancia del mecanismo. Si hay que re-aplicar, generar el comando con
-- los valores reales (el token vive en el código de la edge function).

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $do$
begin
  perform cron.unschedule('respaldo-diario');
exception when others then null;
end
$do$;

select cron.schedule(
  'respaldo-diario',
  '0 8 * * *',
  $cron$
  select net.http_post(
    url := 'https://kklkpasfmtilngcemmgu.supabase.co/functions/v1/respaldo?token=TOKEN_SECRETO_AQUI',
    headers := '{"Authorization": "Bearer ANON_KEY_AQUI", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);
