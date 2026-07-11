-- Migration 102: permitir devolver un pedido 'entregado' a un estado anterior
-- (para corregir un pedido marcado entregado por error). 'cancelado' sigue
-- siendo terminal. El permiso de admin se valida en la app antes de llamar.

create or replace function public.cambiar_estado_pedido(p_pedido_id uuid, p_nuevo_estado text, p_usuario_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_estado_actual text;
  v_factura_id    uuid;
  v_tipo          text;
begin
  select estado, factura_id, tipo
    into v_estado_actual, v_factura_id, v_tipo
  from pedidos where id = p_pedido_id for update;

  if not found then raise exception 'Pedido no encontrado: %', p_pedido_id; end if;

  if v_estado_actual = 'cancelado' then
    raise exception 'El pedido está cancelado, no se puede cambiar';
  end if;

  if p_nuevo_estado not in ('pendiente','comprado','usa','bucaramanga','santa_rosa','entregado','cancelado') then
    raise exception 'Estado inválido: %', p_nuevo_estado;
  end if;

  if p_nuevo_estado = v_estado_actual then
    raise exception 'El pedido ya está en estado "%"', v_estado_actual;
  end if;

  if p_nuevo_estado = 'entregado' and v_factura_id is null and v_tipo <> 'venta_inmediata' then
    raise exception 'Debes facturar el pedido antes de entregarlo';
  end if;

  update pedidos set estado = p_nuevo_estado where id = p_pedido_id;

  if p_nuevo_estado = 'cancelado' then
    update pagos set anulado = true where pedido_id = p_pedido_id;
  end if;

  insert into historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id)
  values ('pedidos', p_pedido_id, 'estado', v_estado_actual, p_nuevo_estado, p_usuario_id);
end;
$function$;
