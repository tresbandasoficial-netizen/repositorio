-- Migration 109: conteo físico de inventario
--
-- Carga masiva del inventario real por sede: para cada artículo+talla contado,
-- inserta un movimiento tipo 'ajuste' con delta = contado − stock_actual, de
-- modo que el stock queda exactamente en lo contado. Sin costo (no toca el CPP).
--
-- SECURITY DEFINER porque la RLS de movimientos_inventario solo deja escribir
-- al admin; este RPC valida por sí mismo: admin cuenta cualquier sede, el
-- asesor solo la suya.

create or replace function registrar_conteo_inventario(
  p_sede_id    uuid,
  p_items      jsonb,   -- [{articulo_id, talla, cantidad}]
  p_usuario_id uuid
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rol      text;
  v_sede     uuid;
  v_item     jsonb;
  v_art      uuid;
  v_talla    text;
  v_cant     integer;
  v_actual   integer;
  v_delta    integer;
  v_ajustes  integer := 0;
begin
  select rol, sede_id into v_rol, v_sede from usuarios where id = p_usuario_id;
  if v_rol is null or v_rol = 'visor' then
    raise exception 'Sin permisos para registrar conteos';
  end if;
  if v_rol = 'asesor' and (v_sede is null or v_sede <> p_sede_id) then
    raise exception 'Solo puedes contar el inventario de tu propia sede';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El conteo está vacío';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_art   := (v_item->>'articulo_id')::uuid;
    v_talla := nullif(trim(v_item->>'talla'), '');
    v_cant  := (v_item->>'cantidad')::integer;
    if v_cant is null or v_cant < 0 then
      raise exception 'Cantidad inválida en el conteo';
    end if;

    select coalesce(sum(delta), 0) into v_actual
    from movimientos_inventario
    where articulo_id = v_art
      and sede_id = p_sede_id
      and talla is not distinct from v_talla;

    v_delta := v_cant - v_actual;
    if v_delta <> 0 then
      insert into movimientos_inventario (articulo_id, sede_id, talla, tipo, delta, usuario_id, notas)
      values (v_art, p_sede_id, v_talla, 'ajuste', v_delta, p_usuario_id, 'Conteo físico');
      v_ajustes := v_ajustes + 1;
    end if;
  end loop;

  return v_ajustes;
end;
$$;
