-- 166: al separar un pedido, las compras asignadas conservaban el índice de
-- artículo del pedido ORIGINAL (pedido_item_indice = 2, 3…), pero cada parte
-- separada tiene UN solo artículo (índice 1). La galería da prioridad absoluta
-- a ese índice, así que el artículo salía en rojo "Sin comprar" aunque la
-- compra estuviera registrada y enlazada (caso SR7188-2 / JR7228).

-- 1) El RPC ahora re-basa el índice al mover la compra a su parte (= 1) y
--    limpia los índices huérfanos que quedan en la parte 1.
create or replace function public.separar_pedido_por_articulos(p_pedido_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_rol      text;
  v_pedido   pedidos%rowtype;
  v_base     text;
  v_n        int;
  r          record;
  pg         record;
  v_i        int := 0;
  v_new_id   uuid;
  v_parts    uuid[] := '{}';
  v_nums     text[] := '{}';
  v_caps     int[]  := '{}';   -- capacidad de abono restante por parte
  v_sum      int;
  v_overflow int;
  v_move     int;
  v_take     int;
  v_j        int;
begin
  select rol into v_rol from usuarios where id = auth.uid();
  if v_rol is null or v_rol not in ('admin', 'asesor') then
    raise exception 'Sin permisos para separar pedidos';
  end if;

  select * into v_pedido from pedidos where id = p_pedido_id for update;
  if not found then raise exception 'El pedido no existe'; end if;
  if v_pedido.factura_id is not null then raise exception 'El pedido ya está facturado — no se puede separar'; end if;
  if v_pedido.estado = 'cancelado' then raise exception 'El pedido está cancelado'; end if;

  v_base := v_pedido.numero_orden;
  if v_base ~ '-\d+$' then raise exception 'El pedido % ya es una parte separada', v_base; end if;

  select count(*) into v_n from pedido_items where pedido_id = p_pedido_id;
  if v_n < 2 then raise exception 'El pedido tiene un solo artículo — no hay nada que separar'; end if;

  if exists (select 1 from pedidos where numero_orden ~ ('^' || v_base || '-\d+$')) then
    raise exception 'Ya existen partes de %', v_base;
  end if;

  -- Una parte por artículo, en el orden de los artículos (igual que la galería)
  for r in (
    select pi.*, a.codigo as codigo_catalogo
    from pedido_items pi
    left join articulos a on a.id = pi.articulo_id
    where pi.pedido_id = p_pedido_id
    order by pi.id
  ) loop
    v_i := v_i + 1;
    if v_i = 1 then
      update pedidos
        set numero_orden = v_base || '-1',
            total = r.precio_venta * r.cantidad,
            fecha_actualizacion = now()
        where id = p_pedido_id;
      v_new_id := p_pedido_id;
    else
      insert into pedidos (numero_orden, sede_id, asesor_id, cliente_id, total,
                           tipo_entrega, direccion_entrega, notas, estado, tipo, fecha_creacion)
      values (v_base || '-' || v_i, v_pedido.sede_id, v_pedido.asesor_id, v_pedido.cliente_id,
              r.precio_venta * r.cantidad, v_pedido.tipo_entrega, v_pedido.direccion_entrega,
              v_pedido.notas, v_pedido.estado, v_pedido.tipo, v_pedido.fecha_creacion)
      returning id into v_new_id;

      update pedido_items set pedido_id = v_new_id where id = r.id;

      -- Compras ya asignadas a ESTE artículo se van con su parte (máximo las
      -- unidades del artículo; se identifica por artículo del catálogo o código).
      -- El índice se re-basa a 1: la parte nueva tiene un solo artículo, y el
      -- índice viejo apuntaba a la posición en el pedido ORIGINAL.
      update compra_items ci set pedido_id = v_new_id, pedido_item_indice = 1
      where ci.id in (
        select ci2.id from compra_items ci2
        where ci2.pedido_id = p_pedido_id
          and ((r.articulo_id is not null and ci2.articulo_id = r.articulo_id)
            or (coalesce(ci2.codigo, '') <> '' and upper(ci2.codigo) = upper(coalesce(r.codigo, r.codigo_catalogo, ''))))
        order by ci2.creado_en
        limit r.cantidad
      );
    end if;

    v_parts := v_parts || v_new_id;
    v_nums  := v_nums  || (v_base || '-' || v_i);
    v_caps  := v_caps  || (r.precio_venta * r.cantidad);
  end loop;

  -- La parte 1 conserva el id original y queda con UN solo artículo: un índice
  -- grabado > 1 apunta a un artículo que ya se fue con otra parte (compra que
  -- no se pudo identificar por artículo/código). Se limpia para que el cruce
  -- de la galería caiga a las pasadas aproximadas en vez de no cruzar nunca.
  update compra_items
    set pedido_item_indice = null
    where pedido_id = p_pedido_id and pedido_item_indice > 1;

  -- Repartir los abonos: quedan en la parte 1 y el exceso pasa a las
  -- siguientes partes (dividiendo el último abono si es necesario).
  select coalesce(sum(monto), 0) into v_sum
    from pagos where pedido_id = p_pedido_id and anulado = false;
  v_overflow := v_sum - v_caps[1];

  if v_overflow > 0 then
    for pg in (
      select * from pagos
      where pedido_id = p_pedido_id and anulado = false
      order by fecha desc, creado_en desc
    ) loop
      exit when v_overflow <= 0;
      v_move := least(pg.monto, v_overflow);
      v_j := 2;
      while v_move > 0 and v_j <= v_n loop
        v_take := least(v_move, v_caps[v_j]);
        if v_take > 0 then
          if v_take = pg.monto then
            update pagos set pedido_id = v_parts[v_j] where id = pg.id;
          else
            update pagos set monto = monto - v_take where id = pg.id;
            insert into pagos (pedido_id, monto, metodo, cuenta_id, fecha, asesor_id, notas, anulado, confirmado, creado_en)
            values (v_parts[v_j], v_take, pg.metodo, pg.cuenta_id, pg.fecha, pg.asesor_id,
                    trim(coalesce(pg.notas, '') || ' (dividido al separar ' || v_base || ')'), false, pg.confirmado, pg.creado_en);
          end if;
          pg.monto := pg.monto - v_take;
          v_caps[v_j] := v_caps[v_j] - v_take;
          v_move := v_move - v_take;
          v_overflow := v_overflow - v_take;
        else
          v_j := v_j + 1;
        end if;
      end loop;
    end loop;
  end if;

  insert into historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id)
  values ('pedidos', p_pedido_id, 'separacion', v_base,
          array_to_string(v_nums, ', '), auth.uid());

  return jsonb_build_object('partes', to_jsonb(v_nums));
end;
$function$;

-- 2) Corrección de datos: compras de separaciones anteriores con el índice
--    desfasado (pedido de un solo artículo con índice > 1). Eran 21 filas en
--    15 pedidos separados (SR7188-2, TR6835-2/3/4, TR7115-2/5, SR7081-2/3/4…).
update compra_items ci
  set pedido_item_indice = 1
  where ci.pedido_id is not null
    and ci.pedido_item_indice > 1
    and (select count(*) from pedido_items pi where pi.pedido_id = ci.pedido_id) = 1;
