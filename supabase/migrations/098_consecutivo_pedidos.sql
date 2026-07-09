-- Migration 098: consecutivo oficial de pedidos
--
-- El número de pedido dejaba de ser confiable porque se calculaba mirando los
-- últimos pedidos y el usuario podía digitarlo a mano (un dedazo como TR65281
-- arrastró toda la serie). Ahora hay UNA secuencia en la base de datos:
--   · asignar_numero_pedido(): entrega el siguiente número (atómico, sin
--     duplicados ni carreras). Lo usa el servidor al crear pedidos/ventas.
--   · ver_proximo_numero_pedido(): muestra el próximo sin consumirlo (para el
--     formulario).
-- Arranca en 6665 (la serie real va en TR6664).

create sequence if not exists pedidos_numero_seq;
select setval('pedidos_numero_seq', 6664);

create or replace function public.asignar_numero_pedido()
returns bigint
language sql
security definer
set search_path = public, pg_temp
as $$ select nextval('pedidos_numero_seq') $$;

create or replace function public.ver_proximo_numero_pedido()
returns bigint
language sql
security definer
set search_path = public, pg_temp
as $$
  select last_value + (case when is_called then 1 else 0 end)
  from pedidos_numero_seq
$$;

revoke execute on function public.asignar_numero_pedido() from public;
revoke execute on function public.asignar_numero_pedido() from anon;
revoke execute on function public.ver_proximo_numero_pedido() from public;
revoke execute on function public.ver_proximo_numero_pedido() from anon;
grant execute on function public.asignar_numero_pedido() to authenticated;
grant execute on function public.ver_proximo_numero_pedido() to authenticated;
