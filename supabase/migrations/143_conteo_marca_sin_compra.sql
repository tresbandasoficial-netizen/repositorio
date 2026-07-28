-- Migración 143: el conteo por marca también sabe contar "falta comprar"
--
-- La galería agregó el filtro "Falta comprar" (pedidos sin ninguna compra
-- registrada, en cualquier estado). Los botones de marca tienen que contar lo
-- mismo que muestra la cuadrícula; si no, dirían un número y saldría otro.
--
-- p_solo_sin_compra = true  → pedidos sin compra, ni cancelados ni entregados
--                             (p_estado se ignora)
-- p_solo_sin_compra = false → como antes: por estado, o todos si viene null

create or replace function conteo_articulos_por_marca(
  p_estado text default null,
  p_solo_sin_compra boolean default false
)
returns table (marca text, articulos bigint, pedidos bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    m.marca,
    count(pi.id)         as articulos,
    count(distinct p.id) as pedidos
  from (values ('ALO'),('Nike'),('Adidas'),('Puma'),('On'),
               ('Lacoste'),('Hugo Boss'),('New Balance')) as m(marca)
  join pedido_items pi
    on lower(trim(coalesce(pi.marca, ''))) = lower(m.marca)
    or lower(trim(coalesce(
         (select a.marca from articulos a where a.id = pi.articulo_id), ''))) = lower(m.marca)
  join pedidos p
    on p.id = pi.pedido_id
   and p.estado <> 'cancelado'
   and (
     case when p_solo_sin_compra
       then p.estado <> 'entregado'
            and not exists (select 1 from compra_items ci where ci.pedido_id = p.id)
       else p_estado is null or p.estado = p_estado
     end
   )
  group by m.marca
  having count(pi.id) > 0
  order by count(pi.id) desc;
$$;

revoke all on function conteo_articulos_por_marca(text, boolean) from anon;
grant execute on function conteo_articulos_por_marca(text, boolean) to authenticated;

-- La firma de un solo parámetro queda huérfana: si se deja, PostgREST puede
-- resolver la llamada a la vieja y el conteo no respetaría el filtro nuevo.
drop function if exists conteo_articulos_por_marca(text);
