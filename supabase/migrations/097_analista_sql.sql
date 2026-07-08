-- Migration 097: función de consulta para el agente analista de datos
--
-- Ejecuta UNA consulta de solo lectura y devuelve JSON (máx. 200 filas).
-- Protecciones: solo SELECT/WITH, sin ';', y la transacción se fuerza a
-- read-only (cualquier intento de escritura, directo o vía función, falla).
-- Solo la puede ejecutar el service_role (el servidor de la app, que además
-- exige rol admin antes de llamarla).

create or replace function public.analista_sql(p_query text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  q text := btrim(p_query);
  resultado jsonb;
begin
  if q !~* '^\s*(select|with)\y' then
    raise exception 'Solo se permiten consultas SELECT';
  end if;
  if position(';' in q) > 0 then
    raise exception 'No se permiten múltiples sentencias';
  end if;

  execute 'set local transaction_read_only = on';

  execute format(
    'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (select * from (%s) consulta limit 200) t',
    q
  ) into resultado;

  return resultado;
end $$;

revoke execute on function public.analista_sql(text) from public;
revoke execute on function public.analista_sql(text) from anon;
revoke execute on function public.analista_sql(text) from authenticated;
