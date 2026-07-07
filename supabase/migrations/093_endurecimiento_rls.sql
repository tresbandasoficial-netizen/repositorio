-- Migration 093: endurecimiento de seguridad (auditoría)
--
-- 1. gastos: los no-admin ya no pueden LEER los gastos de compras de mercancía
--    a nivel de base de datos (antes gastos_select era using(true) y el filtro
--    solo existía en la app). El cuadre no se afecta: sus sumas usan el admin
--    client desde esta misma versión.
-- 2. Funciones propias de public con search_path fijo (advisor
--    function_search_path_mutable): evita que un search_path manipulado desvíe
--    las funciones SECURITY DEFINER a objetos falsos.
-- 3. Storage: se elimina la política amplia de SELECT que permitía LISTAR todos
--    los archivos del bucket pedido-items. Las imágenes siguen siendo públicas
--    por URL directa (bucket público) y los uploads no cambian.

-- ── 1. RLS de gastos ─────────────────────────────────────────────────────────
drop policy if exists gastos_select on gastos;
create policy gastos_select on gastos for select using (
  auth_es_admin() or categoria <> 'compras_mercancia'
);

-- ── 2. search_path fijo en funciones propias (no de extensiones) ─────────────
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e'
      )
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c
        where c like 'search_path=%'
      )
  loop
    execute format('alter function %s set search_path = public, pg_temp', f.sig);
  end loop;
end $$;

-- ── 3. Bloquear listado del bucket de imágenes ───────────────────────────────
drop policy if exists "Imagenes de productos son publicas" on storage.objects;
