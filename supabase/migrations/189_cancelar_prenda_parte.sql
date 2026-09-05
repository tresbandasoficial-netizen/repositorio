-- Migración 189: cancelar UNA prenda de un pedido separado — atómico
--
-- Pedido de Johan: "pidió unos tenis y unas medias, cancelar solo las medias".
-- El flujo TS separa el pedido (RPC 119/166) y luego llama ESTA función con la
-- parte a cancelar. Todo pasa en UNA transacción (la revisión encontró que
-- hacerlo con llamadas sueltas podía perder o duplicar plata si una fallaba):
--
--   1. Los abonos reales de la parte se mueven a las partes hermanas VIVAS,
--      llenándolas por capacidad (total − abonado) en orden y dividiendo el
--      pago que quede a caballo — el mismo criterio del RPC de separación.
--      Si no caben, la función falla con mensaje claro y NADA cambia.
--      (Cancelar sin mover anularía los pagos — mig. 076 — y la plata del
--      cliente saldría de cartera en silencio.)
--   2. El registro de crédito (metodo='credito'), si existe, viaja entero a
--      la primera parte viva (no es plata, no consume capacidad).
--   3. La compra asignada a la prenda queda LIBRE (sin_asignar) y, si la
--      mercancía ya llegó, vuelve al stock de Bucaramanga con su costo — la
--      unidad queda disponible para vitrina o para otra sugerencia.
--   4. La parte se cancela por el flujo oficial (cambiar_estado_pedido:
--      historial + anulación de pagos restantes, que ya quedó vacía de plata).

create or replace function cancelar_prenda_parte(p_parte_id uuid, p_usuario_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol      text;
  v_parte    pedidos%rowtype;
  v_base     text;
  r          record;
  pg         record;
  ci         record;
  v_vivas    uuid[] := '{}';
  v_caps     int[]  := '{}';
  v_cap      int;
  v_abonos   int;
  v_cap_tot  int;
  v_j        int;
  v_move     int;
  v_take     int;
  v_primera  boolean;
  v_neto     int;
begin
  select rol into v_rol from usuarios where id = auth.uid();
  if v_rol is null or v_rol not in ('admin', 'asesor') then
    raise exception 'Sin permisos para cancelar prendas';
  end if;

  select * into v_parte from pedidos where id = p_parte_id for update;
  if not found then raise exception 'La parte no existe'; end if;
  if v_parte.estado in ('cancelado', 'entregado') then
    raise exception 'La parte % ya está %', v_parte.numero_orden, v_parte.estado;
  end if;
  if v_parte.factura_id is not null then
    raise exception 'La parte % está facturada — anula la factura primero', v_parte.numero_orden;
  end if;
  if v_parte.numero_orden !~ '-\d+$' then
    raise exception 'El pedido % no es una parte separada', v_parte.numero_orden;
  end if;

  v_base := regexp_replace(v_parte.numero_orden, '-\d+$', '');

  -- Partes hermanas vivas, en orden por sufijo, bloqueadas para esta transacción.
  for r in (
    select p.id, p.total
    from pedidos p
    where p.numero_orden ~ ('^' || v_base || '-\d+$')
      and p.id <> p_parte_id
      and p.estado not in ('cancelado')
    order by (regexp_replace(p.numero_orden, '^.*-', ''))::int
    for update
  ) loop
    select r.total - coalesce(sum(monto), 0) into v_cap
    from pagos where pedido_id = r.id and anulado = false and metodo <> 'credito';
    v_vivas := v_vivas || r.id;
    v_caps  := v_caps  || greatest(coalesce(v_cap, r.total), 0);
  end loop;

  select coalesce(sum(monto), 0) into v_abonos
  from pagos where pedido_id = p_parte_id and anulado = false and metodo <> 'credito';

  if v_abonos > 0 then
    if coalesce(array_length(v_vivas, 1), 0) = 0 then
      raise exception 'La parte tiene abonos y no quedan prendas vivas a dónde moverlos — anula los abonos primero';
    end if;
    select coalesce(sum(c), 0) into v_cap_tot from unnest(v_caps) c;
    if v_abonos > v_cap_tot then
      raise exception 'El cliente tiene abonados $% en esta prenda y las que quedan solo reciben $% — anula o devuelve la diferencia antes de cancelar', v_abonos, v_cap_tot;
    end if;

    v_j := 1;
    for pg in (
      select * from pagos
      where pedido_id = p_parte_id and anulado = false and metodo <> 'credito'
      order by creado_en, id
    ) loop
      v_move := pg.monto;
      v_primera := true;
      while v_move > 0 loop
        while v_j <= array_length(v_vivas, 1) and v_caps[v_j] <= 0 loop
          v_j := v_j + 1;
        end loop;
        if v_j > array_length(v_vivas, 1) then
          raise exception 'No cupo el abono en las prendas vivas'; -- no debería pasar (validado arriba)
        end if;
        v_take := least(v_move, v_caps[v_j]);
        if v_primera then
          update pagos set pedido_id = v_vivas[v_j], monto = v_take where id = pg.id;
          v_primera := false;
        else
          insert into pagos (pedido_id, monto, metodo, cuenta_id, fecha, asesor_id, notas, anulado, confirmado, creado_en)
          values (
            v_vivas[v_j], v_take, pg.metodo, pg.cuenta_id, pg.fecha, pg.asesor_id,
            coalesce(pg.notas || ' · ', '') || '(dividido al cancelar ' || v_parte.numero_orden || ')',
            false, pg.confirmado, pg.creado_en
          );
        end if;
        v_caps[v_j] := v_caps[v_j] - v_take;
        v_move := v_move - v_take;
      end loop;
    end loop;
  end if;

  -- El registro de crédito no es plata: viaja entero a la primera viva.
  if coalesce(array_length(v_vivas, 1), 0) > 0 then
    update pagos set pedido_id = v_vivas[1]
    where pedido_id = p_parte_id and anulado = false and metodo = 'credito';
  end if;

  -- La compra asignada a la prenda queda libre y, si ya llegó, vuelve al stock.
  for ci in (
    select x.id, x.cantidad, x.talla, x.articulo_id, x.costo_unitario_cop, c.llegada_en
    from compra_items x join compras c on c.id = x.compra_id
    where x.pedido_id = p_parte_id
  ) loop
    update compra_items
    set destino = 'sin_asignar', pedido_id = null, pedido_item_indice = null
    where id = ci.id;

    if ci.llegada_en is not null and ci.articulo_id is not null then
      select coalesce(sum(delta), 0) into v_neto
      from movimientos_inventario where compra_item_id = ci.id;
      if ci.cantidad - v_neto > 0 then
        insert into movimientos_inventario
          (articulo_id, talla, sede_id, delta, tipo, compra_item_id, pedido_id, costo_unitario_cop, usuario_id, notas)
        select ci.articulo_id, nullif(ci.talla, ''), s.id, ci.cantidad - v_neto, 'entrada',
               ci.id, null, ci.costo_unitario_cop, p_usuario_id,
               'Vuelve al stock: prenda cancelada (' || v_parte.numero_orden || ')'
        from sedes s where s.codigo = 'TR';
      end if;
    end if;
  end loop;

  -- Cancelación oficial: historial + anula los pagos restantes (ya sin plata real).
  perform cambiar_estado_pedido(p_parte_id, 'cancelado', p_usuario_id);
end;
$$;

revoke all on function cancelar_prenda_parte(uuid, uuid) from anon;
grant execute on function cancelar_prenda_parte(uuid, uuid) to authenticated;
