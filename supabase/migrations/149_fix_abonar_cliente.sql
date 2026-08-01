-- Migration 149: abonar_cliente calculaba mal el saldo de pedidos facturados
--
-- Fallas del cálculo anterior (por pedido):
--   total - sum(pagos) - sum(pagos_factura de su factura)
-- 1. No excluía pagos anulados ni metodo='credito' (el crédito ES la deuda,
--    no un pago real) — con el registro de crédito el saldo daba <= 0 y el
--    RPC respondía "aplicado 0" aunque la cartera mostrara deuda.
-- 2. Restaba TODOS los pagos de la factura a CADA pedido de esa factura
--    (doble descuento cuando una factura agrupa varios pedidos).
--
-- Ahora: para pedidos facturados el saldo se mide a nivel de FACTURA
-- (f.total ya es el neto restante al facturar; se le restan sus pagos reales),
-- y para pedidos sin factura, total - pagos reales del pedido. Como el insert
-- reduce el saldo recalculado, los demás pedidos de la misma factura no
-- vuelven a cobrar lo mismo.

create or replace function public.abonar_cliente(
  p_cliente_id uuid,
  p_monto integer,
  p_metodo text,
  p_cuenta_id uuid,
  p_asesor_id uuid,
  p_fecha date,
  p_notas text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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

    if v_ped.factura_id is not null then
      -- Saldo de la factura: su total (neto al facturar) menos pagos reales.
      select f.total - coalesce((
          select sum(pf.monto) from pagos_factura pf
          where pf.factura_id = f.id and pf.anulado = false and pf.metodo <> 'credito'
        ), 0)
      into v_saldo
      from facturas f
      where f.id = v_ped.factura_id and f.estado <> 'anulada';
    else
      -- Saldo del pedido: total menos pagos reales directos.
      v_saldo := v_ped.total - coalesce((
        select sum(monto) from pagos
        where pedido_id = v_ped.id and anulado = false and metodo <> 'credito'
      ), 0);
    end if;

    if v_saldo is null or v_saldo <= 0 then
      continue;
    end if;

    v_aplicar  := least(v_restante, v_saldo);
    v_restante := v_restante - v_aplicar;

    if v_ped.factura_id is not null then
      insert into pagos_factura (factura_id, monto, metodo, cuenta_id, asesor_id, fecha, notas)
      values (v_ped.factura_id, v_aplicar, p_metodo, p_cuenta_id, p_asesor_id, p_fecha, p_notas);

      -- Si con este abono la factura queda saldada (con pagos reales), marcarla pagada.
      update facturas f set estado = 'pagada', actualizado_en = now()
      where f.id = v_ped.factura_id
        and f.estado <> 'anulada'
        and (select coalesce(sum(monto), 0) from pagos_factura
             where factura_id = f.id and anulado = false and metodo <> 'credito') >= f.total;
    else
      insert into pagos (pedido_id, monto, metodo, cuenta_id, asesor_id, fecha, notas)
      values (v_ped.id, v_aplicar, p_metodo, p_cuenta_id, p_asesor_id, p_fecha, p_notas);
    end if;
  end loop;

  return jsonb_build_object('aplicado', p_monto - v_restante, 'sobrante', v_restante);
end;
$function$;
