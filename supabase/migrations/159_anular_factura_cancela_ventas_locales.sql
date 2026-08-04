-- Al anular una factura, los pedidos por encargo se desvinculan y siguen
-- vivos (la deuda del cliente es real). Pero las VENTAS LOCALES (VL-, tipo
-- venta_inmediata) NACEN con la factura: dejarlas vivas dejaba una deuda
-- fantasma en cartera (caso FAC-TR-2026-0242). Ahora se cancelan con la
-- factura: pagos anulados y salidas de inventario revertidas.
create or replace function public.anular_factura(p_factura_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  -- a) Pagos con mensajería pendientes generados automáticamente al facturar
  delete from pagos_mensajeria
  where factura_id = p_factura_id
    and estado = 'pendiente';

  -- b) Domicilios pendientes creados automáticamente al facturar
  delete from domicilios
  where factura_id = p_factura_id
    and estado = 'pendiente';

  -- c) Gastos automáticos de domicilio o envío ligados a esta factura
  delete from gastos
  where origen_id = p_factura_id
    and origen in ('domicilio', 'envio');

  -- d) Anular los abonos de la factura (se conservan para auditoría)
  update pagos_factura
  set anulado = true
  where factura_id = p_factura_id;

  -- e0) Ventas locales de esta factura: se cancelan (no existen sin ella).
  --     Sus pagos se anulan y sus salidas de stock se revierten.
  update pagos set anulado = true
  where pedido_id in (
    select id from pedidos
    where factura_id = p_factura_id and tipo = 'venta_inmediata'
  );

  insert into movimientos_inventario
    (articulo_id, talla, sede_id, delta, tipo, pedido_id, costo_unitario_cop, notas)
  select m.articulo_id, m.talla, m.sede_id, -m.delta, 'entrada', m.pedido_id,
         m.costo_unitario_cop, 'Anulación de factura: reversa de la venta'
  from movimientos_inventario m
  join pedidos p on p.id = m.pedido_id
  where p.factura_id = p_factura_id
    and p.tipo = 'venta_inmediata'
    and m.tipo = 'salida';

  update pedidos set estado = 'cancelado'
  where factura_id = p_factura_id and tipo = 'venta_inmediata';

  -- e) Desvincular pedidos por encargo (siguen existiendo, vuelven a cartera libre)
  update pedidos set factura_id = null where factura_id = p_factura_id;

  -- f) Marcar factura como anulada
  update facturas
  set estado = 'anulada', actualizado_en = now()
  where id = p_factura_id;
end;
$function$;
