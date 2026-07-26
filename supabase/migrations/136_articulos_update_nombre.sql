-- Migración 136: las asesoras pueden corregir el nombre de un artículo del catálogo
--
-- Sobre articulos solo había política de UPDATE para admin (articulos_admin).
-- Como las asesoras SÍ pueden crear artículos (articulos_insert, auth_no_es_visor),
-- podían dejar un código con el nombre equivocado y no había forma de arreglarlo
-- desde el pedido: el UPDATE no daba error, simplemente no tocaba ninguna fila
-- porque RLS la filtraba. Resultado: la galería mostraba pedido_items.descripcion
-- ("short") y las compras articulos.nombre ("Bra") para el mismo IQ1037-010.
--
-- Se abre UPDATE al mismo grupo que ya puede insertar. El único camino que lo
-- usa sin ser admin es guardarNombreArticuloAction, que solo escribe `nombre`.

alter table articulos enable row level security;

drop policy if exists articulos_update on articulos;
create policy articulos_update on articulos
  for update
  using (auth_no_es_visor())
  with check (auth_no_es_visor());

-- Regla de la migración 111: los defaults de postgres/supabase_admin conceden
-- todo a `anon` en cada objeto nuevo. Aquí no se crean objetos, pero se deja
-- explícito que anon no toca esta tabla.
revoke all on articulos from anon;
