-- Migración 196: asignación parcial ATÓMICA de un ítem de compra
--
-- (En la BD viva se aplicó primero un borrador "dividir_compra_item" que solo
-- dividía la fila y dejaba la asignación y el stock en llamadas REST
-- separadas; la revisión adversarial halló que cualquier fallo a mitad de
-- vuelo dejaba renglones huérfanos, stock fantasma y dobles divisiones al
-- reintentar — supabase-js no lanza. Ese borrador quedó eliminado con
-- `drop function` aquí mismo y nunca llegó al repo.)
--
-- Ahora TODO pasa en UNA transacción:
--   1. lock del renglón original + validaciones (debe estar sin_asignar);
--   2. nace el renglón nuevo YA asignado (pedido o Contoda);
--   3. el original queda con cantidad - N;
--   4. el stock del original se ajusta aquí mismo si la compra ya llegó
--      (misma semántica de _sincronizarStockCompraItem: neto objetivo =
--      cantidad para sin_asignar llegado; el renglón nuevo asignado no lleva
--      movimientos — su objetivo es 0. La salida va con pedido_id NULL: el
--      costo del pedido ya lo aporta compra_items.pedido_id en
--      vista_ganancia_pedidos y con pedido_id se contaría doble);
--   5. si es para pedido y el pedido está pendiente, pasa a 'comprado'.
--
-- Solo la usa el server con service_role (la acción exige admin).

create or replace function asignar_parcial_compra_item(
  p_item_id            uuid,
  p_unidades           int,
  p_destino            text,      -- 'pedido' | 'contoda'
  p_pedido_id          uuid,      -- obligatorio si p_destino = 'pedido'
  p_pedido_item_indice smallint,
  p_usuario_id         uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item    compra_items%rowtype;
  v_llegada timestamptz;
  v_nuevo   uuid;
  v_neto    int;
  v_ajuste  int;
  v_tr      uuid;
begin
  if p_destino not in ('pedido', 'contoda') then
    raise exception 'Destino inválido para asignación parcial';
  end if;
  if p_destino = 'pedido' and p_pedido_id is null then
    raise exception 'Falta el pedido para la asignación parcial';
  end if;

  select * into v_item from compra_items where id = p_item_id for update;
  if not found then
    raise exception 'Ítem de compra no encontrado';
  end if;
  -- Solo se dividen filas SIN ASIGNAR: divide-de-asignada abriría carreras
  -- con el panel de sugerencias (que reclama filas sin_asignar) y dejaría al
  -- pedido original con menos unidades de las que validó.
  if v_item.destino <> 'sin_asignar' or v_item.pedido_id is not null then
    raise exception 'La fila ya está asignada — pásala primero a "Sin asignar" para poder dividirla';
  end if;
  if p_unidades is null or p_unidades < 1 or p_unidades >= v_item.cantidad then
    raise exception 'Para dividir, las unidades deben estar entre 1 y % (la fila tiene %)',
      v_item.cantidad - 1, v_item.cantidad;
  end if;

  -- Renglón nuevo YA asignado (copia explícita de columnas — si compra_items
  -- gana columnas nuevas hay que sumarlas aquí; creado_en usa su default).
  insert into compra_items
    (compra_id, descripcion, marca, talla, cantidad, costo_unitario_cop,
     destino, pedido_id, pedido_item_indice, transferido_contoda, transferido_en,
     articulo_id, codigo)
  values
    (v_item.compra_id, v_item.descripcion, v_item.marca, v_item.talla, p_unidades,
     v_item.costo_unitario_cop, p_destino,
     case when p_destino = 'pedido' then p_pedido_id end,
     case when p_destino = 'pedido' then p_pedido_item_indice end,
     p_destino = 'contoda',
     case when p_destino = 'contoda' then now() end,
     v_item.articulo_id, v_item.codigo)
  returning id into v_nuevo;

  update compra_items set cantidad = cantidad - p_unidades where id = p_item_id;

  -- Stock del renglón original (sigue sin_asignar): con la compra ya llegada,
  -- su neto de movimientos debe igualar la cantidad nueva. Sin articulo_id no
  -- hay movimientos que ajustar (la entrada de llegada exige artículo).
  select llegada_en into v_llegada from compras where id = v_item.compra_id;
  if v_llegada is not null and v_item.articulo_id is not null then
    select coalesce(sum(delta), 0) into v_neto
    from movimientos_inventario where compra_item_id = p_item_id;
    v_ajuste := (v_item.cantidad - p_unidades) - v_neto;
    if v_ajuste <> 0 then
      select id into v_tr from sedes where codigo = 'TR';
      insert into movimientos_inventario
        (articulo_id, talla, sede_id, delta, tipo, compra_item_id, pedido_id,
         costo_unitario_cop, usuario_id, notas)
      values
        (v_item.articulo_id, nullif(trim(v_item.talla), ''), v_tr, v_ajuste,
         case when v_ajuste > 0 then 'entrada' else 'salida' end,
         p_item_id, null, v_item.costo_unitario_cop, p_usuario_id,
         case when v_ajuste > 0
           then 'Vuelve al stock de Bucaramanga (compra sin asignar)'
           else 'Sale del stock de Bucaramanga (la fila se dividió: unidades asignadas aparte)'
         end);
    end if;
  end if;

  if p_destino = 'pedido' then
    update pedidos
    set estado = 'comprado', fecha_actualizacion = now()
    where id = p_pedido_id and estado = 'pendiente';
  end if;

  return v_nuevo;
end;
$$;

drop function if exists dividir_compra_item(uuid, int);

revoke execute on function asignar_parcial_compra_item(uuid, int, text, uuid, smallint, uuid) from public, anon, authenticated;
grant execute on function asignar_parcial_compra_item(uuid, int, text, uuid, smallint, uuid) to service_role;
