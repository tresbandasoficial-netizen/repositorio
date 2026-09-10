-- Migración 193: fotos de los artículos de cada compra (lista de /compras)
--
-- La lista de compras muestra junto al proveedor una tira horizontal con las
-- fotos de los artículos. La compra no guarda imagen propia: se resuelve con
-- la MISMA prioridad del detalle de compra — 1) la foto del artículo del
-- pedido enlazado por posición (pedido_item_indice, 1-based por orden de id),
-- 2) cualquier foto de ese pedido, 3) la última foto conocida del artículo
-- del catálogo en pedidos, 4) la foto de la ficha del catálogo.
--
-- Va en SQL y agregado POR COMPRA (una fila por compra, items en jsonb):
-- traer los ~1100 compra_items por la API chocaría con el tope de filas
-- de PostgREST (Max Rows 1000) y truncaría en silencio.
--
-- SECURITY INVOKER (default). Sin acceso para anon.

create or replace function fotos_compras()
returns table(compra_id uuid, items jsonb)
language sql
stable
set search_path = public
as $$
  select
    ci.compra_id,
    jsonb_agg(
      jsonb_build_object(
        'foto', coalesce(
          -- 1) foto del artículo del pedido enlazado, por posición
          (select nullif(x.imagen_url, '')
             from (select pi.imagen_url, row_number() over (order by pi.id) as rn
                     from pedido_items pi
                    where pi.pedido_id = ci.pedido_id) x
            where x.rn = ci.pedido_item_indice),
          -- 2) cualquier foto de ese pedido
          (select pi.imagen_url
             from pedido_items pi
            where pi.pedido_id = ci.pedido_id
              and pi.imagen_url is not null and pi.imagen_url <> ''
            order by pi.id
            limit 1),
          -- 3) la última foto conocida del artículo en pedidos
          (select pi.imagen_url
             from pedido_items pi
            where pi.articulo_id = ci.articulo_id
              and pi.imagen_url is not null and pi.imagen_url <> ''
            order by pi.id desc
            limit 1),
          -- 4) la foto de la ficha del catálogo
          (select nullif(a.fotos[1], '')
             from articulos a
            where a.id = ci.articulo_id)
        ),
        'nombre', trim(concat_ws(' ',
          nullif(trim(ci.marca), ''),
          nullif(trim(ci.descripcion), ''),
          case when nullif(trim(ci.talla), '') is not null
               then 'T' || upper(trim(ci.talla)) end
        ))
      )
      order by ci.creado_en, ci.id
    ) as items
  from compra_items ci
  group by ci.compra_id
$$;

revoke execute on function fotos_compras() from public, anon;
grant execute on function fotos_compras() to authenticated;
