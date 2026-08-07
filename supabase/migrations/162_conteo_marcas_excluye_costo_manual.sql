-- Misma regla de la 161 en el conteo por marca del filtro "falta comprar":
-- un pedido con costo manual ya está costeado y no cuenta como sin compra.
CREATE OR REPLACE FUNCTION public.conteo_articulos_por_marca(p_estado text DEFAULT NULL::text, p_solo_sin_compra boolean DEFAULT false)
 RETURNS TABLE(marca text, articulos bigint, pedidos bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
            and p.costo_manual is null
            and not exists (select 1 from compra_items ci where ci.pedido_id = p.id)
       else p_estado is null or p.estado = p_estado
     end
   )
  group by m.marca
  having count(pi.id) > 0
  order by count(pi.id) desc;
$function$;
