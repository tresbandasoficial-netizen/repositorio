-- Migración 199: fotos de los artículos de una lista de pedidos
--
-- Igual que fotos_facturas (mig. 197) pero agrupado POR PEDIDO: para el
-- historial de pedidos del cliente (y cualquier lista de pedidos que quiera
-- su tira de fotos). Recibe los ids en pantalla y devuelve una fila por
-- pedido con los items en jsonb. Foto: la del item → ficha del catálogo →
-- última foto del artículo en cualquier pedido (respaldo clave para VL).
--
-- Sin costos en la salida; ejecutable por authenticated, sin anon.

create or replace function fotos_pedidos(p_pedido_ids uuid[])
returns table(pedido_id uuid, items jsonb)
language sql
stable
set search_path = public
as $$
  select
    pi.pedido_id,
    jsonb_agg(
      jsonb_build_object(
        'foto', coalesce(
          nullif(pi.imagen_url, ''),
          (select nullif(a.fotos[1], '') from articulos a where a.id = pi.articulo_id),
          (select pi2.imagen_url from pedido_items pi2
            where pi2.articulo_id = pi.articulo_id
              and pi2.imagen_url is not null and pi2.imagen_url <> ''
            order by pi2.id desc limit 1)
        ),
        'nombre', trim(concat_ws(' ',
          nullif(trim(coalesce(pi.marca, '')), ''),
          nullif(trim(pi.descripcion), ''),
          case when nullif(trim(coalesce(pi.talla, '')), '') is not null
               then 'T' || upper(trim(pi.talla)) end
        ))
      )
      order by pi.id
    ) as items
  from pedido_items pi
  where pi.pedido_id = any(p_pedido_ids)
  group by pi.pedido_id
$$;

revoke execute on function fotos_pedidos(uuid[]) from public, anon;
grant execute on function fotos_pedidos(uuid[]) to authenticated;
