-- Migration 070: abonar_cliente atómico
--
-- abonarClienteAction (app/actions/abonos.ts) distribuía el abono entre los
-- pedidos del cliente con múltiples INSERT separados desde Node, leyendo el
-- saldo en memoria. Esto permitía:
--   1. Sobreabono por concurrencia (dos asesores abonando al mismo cliente).
--   2. Estado inconsistente si un INSERT fallaba a mitad del loop.
--
-- Este RPC mueve toda la distribución a una sola transacción de PostgreSQL,
-- bloqueando cada pedido con FOR UPDATE y recalculando el saldo real
-- (pagos + pagos_factura) dentro del lock. Devuelve {aplicado, sobrante}.

CREATE OR REPLACE FUNCTION public.abonar_cliente(
  p_cliente_id uuid,
  p_monto      integer,
  p_metodo     text,
  p_cuenta_id  uuid,
  p_asesor_id  uuid,
  p_fecha      date,
  p_notas      text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
declare
  v_restante integer := p_monto;
  v_ped      record;
  v_saldo    integer;
  v_aplicar  integer;
begin
  if p_monto <= 0 then
    raise exception 'El monto debe ser mayor a cero';
  end if;

  -- Recorre los pedidos no cancelados del cliente, del más antiguo al más
  -- nuevo, bloqueando cada fila para que dos abonos simultáneos no compitan.
  for v_ped in
    select p.id, p.total, p.factura_id
    from pedidos p
    where p.cliente_id = p_cliente_id
      and p.estado <> 'cancelado'
    order by p.fecha_creacion asc
    for update of p
  loop
    exit when v_restante <= 0;

    -- Saldo real = total - (pagos directos + pagos de la factura, si tiene)
    v_saldo := v_ped.total
      - coalesce((select sum(monto) from pagos where pedido_id = v_ped.id), 0)
      - coalesce((select sum(pf.monto) from pagos_factura pf where pf.factura_id = v_ped.factura_id), 0);

    if v_saldo is null or v_saldo <= 0 then
      continue;
    end if;

    v_aplicar  := least(v_restante, v_saldo);
    v_restante := v_restante - v_aplicar;

    if v_ped.factura_id is not null then
      insert into pagos_factura (factura_id, monto, metodo, cuenta_id, asesor_id, fecha, notas)
      values (v_ped.factura_id, v_aplicar, p_metodo, p_cuenta_id, p_asesor_id, p_fecha, p_notas);

      -- Si con este abono la factura queda saldada, marcarla pagada.
      update facturas f set estado = 'pagada', actualizado_en = now()
      where f.id = v_ped.factura_id
        and f.estado <> 'anulada'
        and (select coalesce(sum(monto), 0) from pagos_factura where factura_id = f.id) >= f.total;
    else
      insert into pagos (pedido_id, monto, metodo, cuenta_id, asesor_id, fecha, notas)
      values (v_ped.id, v_aplicar, p_metodo, p_cuenta_id, p_asesor_id, p_fecha, p_notas);
    end if;
  end loop;

  return jsonb_build_object('aplicado', p_monto - v_restante, 'sobrante', v_restante);
end;
$$;
