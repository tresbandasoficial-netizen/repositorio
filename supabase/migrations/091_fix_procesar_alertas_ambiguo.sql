-- Migration 091: fix "column reference usuario_id is ambiguous" en procesar_alertas
--
-- Los parámetros de salida (RETURNS TABLE ... usuario_id ...) chocan con las
-- columnas del mismo nombre dentro de la función (plpgsql sustituye variables
-- en RETURNING/ON CONFLICT). El cron de alertas fallaba a diario desde el
-- 2026-07-02. #variable_conflict use_column resuelve la ambigüedad a favor de
-- la columna, que es siempre la intención aquí.

CREATE OR REPLACE FUNCTION public.procesar_alertas()
 RETURNS TABLE(notificacion_id uuid, usuario_id uuid, usuario_email text, usuario_nombre text, pedido_numero text, pedido_estado text, alerta_tipo text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
#variable_conflict use_column
begin
  return query
  with
  pedidos_con_alerta as (
    select v.id as pedido_id, v.numero_orden, v.estado, v.asesor_id,
      case when v.es_zombie then 'zombie' else 'tiempo_excedido' end as tipo_alerta
    from vista_pedidos_asesor v
    where v.en_alerta = true or v.es_zombie = true
  ),
  nuevas_alertas as (
    insert into alertas (pedido_id, tipo)
    select pca.pedido_id, pca.tipo_alerta from pedidos_con_alerta pca
    where not exists (
      select 1 from alertas a
      where a.pedido_id = pca.pedido_id and a.tipo = pca.tipo_alerta and a.resuelta_en is null
    )
    returning id, pedido_id, tipo
  ),
  dest_asesor as (
    select u.id as usuario_id, u.email, u.nombre, na.id as alerta_id,
      pca.numero_orden, pca.estado, na.tipo
    from nuevas_alertas na
    join pedidos_con_alerta pca on pca.pedido_id = na.pedido_id
    join usuarios u on u.id = pca.asesor_id where u.activo = true
  ),
  dest_admins as (
    select u.id as usuario_id, u.email, u.nombre, na.id as alerta_id,
      pca.numero_orden, pca.estado, na.tipo
    from nuevas_alertas na
    join pedidos_con_alerta pca on pca.pedido_id = na.pedido_id
    cross join usuarios u where u.rol = 'admin' and u.activo = true
  ),
  todos_destinatarios as (select * from dest_asesor union select * from dest_admins),
  nuevas_nots as (
    insert into notificaciones (usuario_id, alerta_id)
    select td.usuario_id, td.alerta_id from todos_destinatarios td
    on conflict (usuario_id, alerta_id) do nothing
    returning id, usuario_id, alerta_id
  )
  select nn.id, nn.usuario_id, td.email, td.nombre, td.numero_orden, td.estado, td.tipo
  from nuevas_nots nn
  join todos_destinatarios td on td.usuario_id = nn.usuario_id and td.alerta_id = nn.alerta_id;
end;
$function$;
