-- Migración 142: cuántos artículos hay por marca en un estado de pedido
--
-- Para el filtro de marca de la galería: saber qué falta pedir de cada marca.
-- Se hace en SQL y no en la app porque el conteo debe ser sobre TODOS los
-- pedidos, no sobre la página de 30 que la galería trae cada vez.
--
-- La marca se toma de la escrita en el pedido y, si el artículo está enlazado al
-- catálogo, también de la del catálogo. Se compara sin distinguir mayúsculas:
-- en los pedidos está escrita de varias formas (Adidas / adidas / ADIDAS).
--
-- p_estado null = todos los estados.

create or replace function conteo_articulos_por_marca(p_estado text default null)
returns table (marca text, articulos bigint, pedidos bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    m.marca,
    count(pi.id)              as articulos,
    count(distinct p.id)      as pedidos
  from (values ('ALO'),('Nike'),('Adidas'),('Puma'),('On'),
               ('Lacoste'),('Hugo Boss'),('New Balance')) as m(marca)
  join pedido_items pi
    on lower(trim(coalesce(pi.marca, ''))) = lower(m.marca)
    or lower(trim(coalesce(
         (select a.marca from articulos a where a.id = pi.articulo_id), ''))) = lower(m.marca)
  join pedidos p
    on p.id = pi.pedido_id
   and p.estado <> 'cancelado'
   and (p_estado is null or p.estado = p_estado)
  group by m.marca
  having count(pi.id) > 0
  order by count(pi.id) desc;
$$;

-- security invoker a propósito: respeta el RLS de quien consulta, así el asesor
-- no ve más de lo que ya puede ver en pedidos.
revoke all on function conteo_articulos_por_marca(text) from anon;
grant execute on function conteo_articulos_por_marca(text) to authenticated;
