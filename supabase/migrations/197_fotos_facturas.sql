-- Migración 197: fotos de lo facturado (lista de /facturacion)
--
-- La lista de facturas muestra una tira con las fotos de TODO lo que se
-- facturó. Los items de una factura viven en sus pedidos (pedidos.factura_id
-- → pedido_items, incluidas las ventas locales VL): foto = la del item del
-- pedido, o la de la ficha del catálogo como respaldo.
--
-- Recibe los ids de las facturas EN PANTALLA (la lista trae máx. 200) y
-- devuelve UNA fila por factura con los items en jsonb — item por item por la
-- API chocaría con el tope de 1000 filas de PostgREST.
--
-- La usan también los asesores (la facturación es suya): sin costos en la
-- salida. SECURITY INVOKER (default); sin acceso para anon.

create or replace function fotos_facturas(p_factura_ids uuid[])
returns table(factura_id uuid, items jsonb)
language sql
stable
set search_path = public
as $$
  select
    p.factura_id,
    jsonb_agg(
      jsonb_build_object(
        'foto', coalesce(
          nullif(pi.imagen_url, ''),
          (select nullif(a.fotos[1], '') from articulos a where a.id = pi.articulo_id),
          -- Las ventas de mostrador (VL) casi nunca tienen foto propia: se usa
          -- la última foto conocida del artículo en cualquier pedido.
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
      order by p.numero_orden, pi.id
    ) as items
  from pedidos p
  join pedido_items pi on pi.pedido_id = p.id
  where p.factura_id = any(p_factura_ids)
  group by p.factura_id
$$;

revoke execute on function fotos_facturas(uuid[]) from public, anon;
grant execute on function fotos_facturas(uuid[]) to authenticated;
