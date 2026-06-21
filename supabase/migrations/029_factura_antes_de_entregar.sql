-- Migration 029: permitir facturar ANTES de entregar
--
-- Regla de negocio corregida: la factura se genera antes de entregar el pedido
-- (facturar → cobrar → entregar), no después. Por eso `crear_factura` ya no
-- exige estado = 'entregado'; basta con que el pedido no esté cancelado ni
-- facturado y sea del mismo cliente y sede.

create or replace function crear_factura(
  p_cliente_id       uuid,
  p_sede_id          uuid,
  p_asesor_id        uuid,
  p_fecha_vencimiento date,
  p_pedido_ids       uuid[],
  p_notas            text default null,
  p_abono_inicial    integer default 0,
  p_metodo_abono     text default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_factura_id uuid;
  v_numero     text;
  v_bruto      integer;
  v_prepagado  integer;
  v_neto       integer;
  v_count      integer;
begin
  if array_length(p_pedido_ids, 1) is null then
    raise exception 'Debe incluir al menos un pedido';
  end if;

  -- Validar: del mismo cliente/sede, NO cancelado y sin factura.
  -- (Ya no se exige 'entregado': se factura antes de entregar.)
  select count(*) into v_count
  from pedidos
  where id = any(p_pedido_ids)
    and cliente_id = p_cliente_id
    and sede_id = p_sede_id
    and estado <> 'cancelado'
    and factura_id is null;

  if v_count <> array_length(p_pedido_ids, 1) then
    raise exception 'Algun pedido no es valido: no debe estar cancelado ni facturado y debe ser del mismo cliente y sede';
  end if;

  select coalesce(sum(total), 0) into v_bruto from pedidos where id = any(p_pedido_ids);
  select coalesce(sum(pg.monto), 0) into v_prepagado from pagos pg where pg.pedido_id = any(p_pedido_ids);

  v_neto := v_bruto - v_prepagado;
  if v_neto < 0 then v_neto := 0; end if;

  v_numero := siguiente_numero_factura(p_sede_id);

  insert into facturas (numero_factura, cliente_id, sede_id, asesor_id, fecha_vencimiento, total, notas)
  values (v_numero, p_cliente_id, p_sede_id, p_asesor_id, p_fecha_vencimiento, v_neto, p_notas)
  returning id into v_factura_id;

  update pedidos set factura_id = v_factura_id where id = any(p_pedido_ids);

  if p_abono_inicial > 0 then
    insert into pagos_factura (factura_id, monto, metodo, asesor_id)
    values (v_factura_id, p_abono_inicial, coalesce(p_metodo_abono, 'efectivo'), p_asesor_id);
    if p_abono_inicial >= v_neto then
      update facturas set estado = 'pagada', actualizado_en = now() where id = v_factura_id;
    end if;
  end if;

  return v_factura_id;
end;
$$;
