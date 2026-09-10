-- Migración 192: colores ya usados en el catálogo (para el selector de color)
--
-- El campo color era texto libre y se llenó de variantes (NEGRO/NEGRA/NEGROS,
-- BLANCO/BLANCA, BEIGE/BEIGGE…). El selector nuevo deja ESCOGER entre los
-- colores ya usados en vez de escribir. Esta función los devuelve agrupados
-- por grafía exacta (mayúsculas, sin espacios sobrantes) con su frecuencia;
-- el agrupado de variantes (plural/femenino) lo hace la app al mostrarlos.
-- No filtra por activo: el color de un artículo inactivo sigue siendo un
-- color válido del catálogo.
--
-- SECURITY INVOKER (el default): corre con los permisos del usuario logueado
-- (articulos ya es legible para authenticated). Sin acceso para anon.

create or replace function colores_usados()
returns table(color text, usos bigint)
language sql
stable
set search_path = public
as $$
  select upper(trim(a.color)) as color, count(*)::bigint as usos
  from articulos a
  where a.color is not null and trim(a.color) <> ''
  group by upper(trim(a.color))
  order by count(*) desc, upper(trim(a.color))
$$;

revoke execute on function colores_usados() from public, anon;
grant execute on function colores_usados() to authenticated;
