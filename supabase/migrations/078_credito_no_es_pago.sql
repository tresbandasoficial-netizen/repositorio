-- Migration 078: El "crédito" no cuenta como pago
--
-- Problema: al facturar una parte "a crédito" (lo que el cliente queda
-- debiendo), el monto se guardaba en pagos_factura igual que un pago real y:
--   1. La factura se marcaba como 'pagada' aunque el cliente no había pagado.
--   2. En vista_cartera_clientes el crédito reducía el saldo del cliente,
--      ocultando la deuda real.
-- El cuadre de caja (vista_flujo_caja, migración 068) ya excluía metodo='credito'
-- por no ser dinero recibido; cartera y el estado de la factura eran inconsistentes.
--
-- Solución:
--   1. crear_factura / crear_factura_venta_local: la factura solo pasa a 'pagada'
--      cuando los pagos REALES (no crédito) cubren el total. El crédito se sigue
--      registrando en pagos_factura como referencia del historial.
--   2. vista_cartera_clientes: excluir metodo='credito' al sumar lo pagado.

-- ── 1. crear_factura ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.crear_factura(
  p_cliente_id         uuid,
  p_sede_id            uuid,
  p_asesor_id          uuid,
  p_fecha_vencimiento  date,
  p_pedido_ids         uuid[],
  p_notas              text    DEFAULT NULL,
  p_abonos             jsonb   DEFAULT NULL,
  p_envio              integer DEFAULT 0,
  p_descuento          integer DEFAULT 0,
  p_tipo_entrega       text    DEFAULT 'tienda',
  p_mensajeria_entrega text    DEFAULT NULL,
  p_valor_entrega      integer DEFAULT 0,
  p_quien_paga_entrega text    DEFAULT NULL,
  p_direccion_entrega  text    DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $function$
declare
  v_factura_id uuid;
  v_numero     text;
  v_bruto      integer;
  v_prepagado  integer;
  v_subtotal   integer;
  v_total      integer;
  v_count      integer;
  v_abono      jsonb;
  v_total_abonado      integer := 0;  -- todos los abonos (incluye crédito) → saldo a recaudar
  v_total_pagado_real  integer := 0;  -- solo pagos reales (no crédito) → liquidación
  v_recaudo_mensajeria integer := 0;  -- lo que la mensajería cobra al cliente y debe a TB
begin
  if array_length(p_pedido_ids, 1) is null then
    raise exception 'Debe incluir al menos un pedido';
  end if;

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

  v_subtotal := v_bruto - v_prepagado;
  if v_subtotal < 0 then v_subtotal := 0; end if;

  v_total := v_subtotal + coalesce(p_envio, 0) - coalesce(p_descuento, 0);
  if v_total < 0 then v_total := 0; end if;

  v_numero := siguiente_numero_factura(p_sede_id);

  insert into facturas (numero_factura, cliente_id, sede_id, asesor_id, fecha_vencimiento, total, envio, descuento, notas,
                        tipo_entrega, mensajeria_entrega, valor_entrega, quien_paga_entrega)
  values (v_numero, p_cliente_id, p_sede_id, p_asesor_id, p_fecha_vencimiento, v_total, coalesce(p_envio, 0), coalesce(p_descuento, 0), p_notas,
          coalesce(p_tipo_entrega, 'tienda'), p_mensajeria_entrega, coalesce(p_valor_entrega, 0), p_quien_paga_entrega)
  returning id into v_factura_id;

  -- Registrar cambio de estado en historial ANTES de actualizar (para capturar valor_anterior)
  insert into historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id)
  select 'pedidos', id, 'estado', estado, 'entregado', p_asesor_id
  from pedidos
  where id = any(p_pedido_ids)
    and estado <> 'entregado';

  -- Vincular pedidos a la factura y marcarlos como entregados
  update pedidos
  set factura_id = v_factura_id,
      estado     = 'entregado'
  where id = any(p_pedido_ids);

  if p_abonos is not null then
    for v_abono in select * from jsonb_array_elements(p_abonos)
    loop
      insert into pagos_factura (factura_id, monto, metodo, cuenta_id, asesor_id)
      values (
        v_factura_id,
        (v_abono->>'monto')::integer,
        v_abono->>'metodo',
        nullif(v_abono->>'cuenta_id', '')::uuid,
        p_asesor_id
      );
      v_total_abonado := v_total_abonado + (v_abono->>'monto')::integer;

      -- El crédito es deuda del cliente, no pago: no liquida la factura.
      if v_abono->>'metodo' <> 'credito' then
        v_total_pagado_real := v_total_pagado_real + (v_abono->>'monto')::integer;
      end if;

      -- Recaudo Mensajería: la mensajería cobra este valor al cliente y se lo
      -- debe a TB. Crea la deuda con la mensajería y alimenta el valor a cobrar
      -- del domicilio (sin esto, el domicilio aparece con $0 a cobrar).
      if v_abono->>'metodo' = 'recaudo_mensajeria' and nullif(v_abono->>'mensajeria', '') is not null then
        insert into pagos_mensajeria (mensajeria, tipo, monto, fecha, factura_id, responsable_id, estado, concepto, notas)
        values (v_abono->>'mensajeria', 'deuda', (v_abono->>'monto')::integer, hoy_bogota(), v_factura_id, p_asesor_id, 'pendiente', 'recaudo',
                'Recaudo mensajería · factura ' || v_numero);
        v_recaudo_mensajeria := v_recaudo_mensajeria + (v_abono->>'monto')::integer;
      end if;
    end loop;

    if v_total_pagado_real >= v_total then
      update facturas set estado = 'pagada', actualizado_en = now() where id = v_factura_id;
    end if;
  end if;

  -- Resolver la entrega (domicilio / envío). El mensajero cobra el recaudo
  -- explícito (líneas metodo='recaudo_mensajeria'), más el domicilio si lo
  -- paga el cliente.
  perform _entrega_factura(
    v_factura_id, v_numero, p_cliente_id, p_sede_id, p_asesor_id,
    v_recaudo_mensajeria,
    coalesce(p_tipo_entrega, 'tienda'), p_mensajeria_entrega, coalesce(p_valor_entrega, 0),
    p_quien_paga_entrega, p_direccion_entrega
  );

  return v_factura_id;
end;
$function$;

-- ── 2. crear_factura_venta_local ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.crear_factura_venta_local(
  p_cliente_id         uuid,
  p_sede_id            uuid,
  p_asesor_id          uuid,
  p_fecha_vencimiento  date,
  p_productos          jsonb,
  p_abonos             jsonb   DEFAULT NULL,
  p_envio              integer DEFAULT 0,
  p_descuento          integer DEFAULT 0,
  p_notas              text    DEFAULT NULL,
  p_tipo_entrega       text    DEFAULT 'tienda',
  p_mensajeria_entrega text    DEFAULT NULL,
  p_valor_entrega      integer DEFAULT 0,
  p_quien_paga_entrega text    DEFAULT NULL,
  p_direccion_entrega  text    DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $function$
declare
  v_factura_id   uuid;
  v_numero       text;
  v_numero_orden text;
  v_subtotal     integer;
  v_total        integer;
  v_producto     jsonb;
  v_pedido_id    uuid;
  v_articulo     uuid;
  v_marca        text;
  v_nombre       text;
  v_color        text;
  v_sexo         text;
  v_categoria    text;
  v_codigo       text;
  v_abono        jsonb;
  v_total_abonado      integer := 0;  -- todos los abonos (para tope)
  v_total_pagado_real  integer := 0;  -- solo pagos reales (no crédito)
  v_recaudo_mensajeria integer := 0;
begin
  v_subtotal := 0;
  for v_producto in select * from jsonb_array_elements(p_productos)
  loop
    v_subtotal := v_subtotal + ((v_producto->>'precio_venta')::integer * (v_producto->>'cantidad')::integer);
  end loop;

  v_total := v_subtotal + coalesce(p_envio, 0) - coalesce(p_descuento, 0);
  if v_total < 0 then v_total := 0; end if;

  v_numero       := siguiente_numero_factura(p_sede_id);
  v_numero_orden := 'VL-' || v_numero;

  insert into facturas (numero_factura, cliente_id, sede_id, asesor_id, fecha_vencimiento, total, envio, descuento, estado, notas,
                        tipo_entrega, mensajeria_entrega, valor_entrega, quien_paga_entrega)
  values (v_numero, p_cliente_id, p_sede_id, p_asesor_id, p_fecha_vencimiento, v_total, coalesce(p_envio, 0), coalesce(p_descuento, 0), 'pendiente', p_notas,
          coalesce(p_tipo_entrega, 'tienda'), p_mensajeria_entrega, coalesce(p_valor_entrega, 0), p_quien_paga_entrega)
  returning id into v_factura_id;

  insert into pedidos (numero_orden, sede_id, asesor_id, cliente_id, total, tipo_entrega, estado, tipo, factura_id)
  values (v_numero_orden, p_sede_id, p_asesor_id, p_cliente_id, v_total, 'sede', 'entregado', 'venta_inmediata', v_factura_id)
  returning id into v_pedido_id;

  for v_producto in select * from jsonb_array_elements(p_productos)
  loop
    v_articulo  := nullif(v_producto->>'articulo_id', '')::uuid;
    v_marca     := v_producto->>'marca';
    v_nombre    := v_producto->>'descripcion';
    v_color     := nullif(v_producto->>'color', '');
    v_sexo      := nullif(v_producto->>'sexo', '');
    v_categoria := nullif(v_producto->>'categoria', '');
    v_codigo    := nullif(v_producto->>'codigo', '');

    if v_articulo is null and v_marca is not null and v_nombre is not null then
      insert into articulos (nombre, marca, codigo, color, sexo, categoria, activo)
      values (v_nombre, v_marca, v_codigo, v_color, v_sexo, v_categoria, true)
      on conflict (lower(marca), lower(nombre), lower(coalesce(color, '')), lower(coalesce(sexo, '')))
      do update set
        categoria = coalesce(excluded.categoria, articulos.categoria),
        color     = coalesce(excluded.color, articulos.color),
        codigo    = coalesce(articulos.codigo, excluded.codigo)
      returning id into v_articulo;
    end if;

    if v_articulo is not null and v_codigo is not null then
      update articulos set codigo = v_codigo where id = v_articulo and codigo is null;
    end if;

    insert into pedido_items (
      pedido_id, articulo_id, marca, descripcion, talla, cantidad,
      precio_venta, color, sexo, categoria, codigo
    )
    values (
      v_pedido_id, v_articulo, v_marca, v_nombre,
      nullif(v_producto->>'talla', ''),
      (v_producto->>'cantidad')::integer,
      (v_producto->>'precio_venta')::integer,
      v_color, v_sexo, v_categoria, v_codigo
    );
  end loop;

  if p_abonos is not null then
    for v_abono in select * from jsonb_array_elements(p_abonos)
    loop
      -- No permitir que la suma de abonos supere el total de la factura.
      if (v_total_abonado + (v_abono->>'monto')::integer) > v_total then
        raise exception 'Los abonos (%) superan el total de la factura (%)',
          v_total_abonado + (v_abono->>'monto')::integer, v_total;
      end if;

      insert into pagos_factura (factura_id, monto, metodo, cuenta_id, asesor_id)
      values (
        v_factura_id,
        (v_abono->>'monto')::integer,
        v_abono->>'metodo',
        nullif(v_abono->>'cuenta_id', '')::uuid,
        p_asesor_id
      );
      v_total_abonado := v_total_abonado + (v_abono->>'monto')::integer;

      -- El crédito es deuda del cliente, no pago: no cuenta para liquidar la factura.
      if v_abono->>'metodo' <> 'credito' then
        v_total_pagado_real := v_total_pagado_real + (v_abono->>'monto')::integer;
      end if;

      if v_abono->>'metodo' = 'recaudo_mensajeria' and nullif(v_abono->>'mensajeria', '') is not null then
        insert into pagos_mensajeria (mensajeria, tipo, monto, fecha, factura_id, responsable_id, estado, concepto, notas)
        values (v_abono->>'mensajeria', 'deuda', (v_abono->>'monto')::integer, hoy_bogota(), v_factura_id, p_asesor_id, 'pendiente', 'recaudo',
                'Recaudo mensajería · factura ' || v_numero);
        v_recaudo_mensajeria := v_recaudo_mensajeria + (v_abono->>'monto')::integer;
      end if;
    end loop;

    if v_total_pagado_real >= v_total then
      update facturas set estado = 'pagada', actualizado_en = now() where id = v_factura_id;
    end if;
  end if;

  perform _entrega_factura(
    v_factura_id, v_numero, p_cliente_id, p_sede_id, p_asesor_id,
    v_recaudo_mensajeria,
    coalesce(p_tipo_entrega, 'tienda'), p_mensajeria_entrega, coalesce(p_valor_entrega, 0),
    p_quien_paga_entrega, p_direccion_entrega
  );

  insert into historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id)
  values ('facturas', v_factura_id, 'estado', null, 'pendiente', p_asesor_id);

  return v_factura_id;
end;
$function$;

-- ── 3. vista_cartera_clientes: el crédito no reduce el saldo ──────────────────
-- DROP + CREATE porque CREATE OR REPLACE no puede eliminar columnas de una vista
-- (error 42P16). Si la vista en producción tiene más columnas de las que vemos
-- en las migrations anteriores, el REPLACE fallaría.
DROP VIEW IF EXISTS vista_cartera_clientes CASCADE;
CREATE VIEW vista_cartera_clientes AS
SELECT
  c.id,
  c.nombre,
  c.telefono_normalizado,
  c.cedula,
  totales.total_comprado::integer                                                          AS total_comprado,
  (coalesce(pag_ped.total_pagado, 0) + coalesce(pag_fac.total_pagado, 0))::integer        AS total_pagado,
  (totales.total_comprado
    - coalesce(pag_ped.total_pagado, 0)
    - coalesce(pag_fac.total_pagado, 0))::integer                                          AS saldo,
  totales.pedidos_activos::integer                                                          AS pedidos_activos
FROM clientes c
JOIN (
  SELECT
    cliente_id,
    SUM(total)  AS total_comprado,
    COUNT(*)    AS pedidos_activos
  FROM pedidos
  WHERE estado != 'cancelado'
  GROUP BY cliente_id
) totales ON totales.cliente_id = c.id
LEFT JOIN (
  -- Abonos previos a facturar (tabla pagos, ligados al pedido). Crédito no es pago.
  SELECT
    p.cliente_id,
    SUM(pg.monto) AS total_pagado
  FROM pagos pg
  JOIN pedidos p ON p.id = pg.pedido_id
  WHERE p.estado != 'cancelado'
    AND pg.metodo != 'credito'
  GROUP BY p.cliente_id
) pag_ped ON pag_ped.cliente_id = c.id
LEFT JOIN (
  -- Abonos post-factura (tabla pagos_factura, ligados a la factura). Crédito no es pago.
  SELECT
    f.cliente_id,
    SUM(pf.monto) AS total_pagado
  FROM pagos_factura pf
  JOIN facturas f ON f.id = pf.factura_id
  WHERE f.estado != 'anulada'
    AND pf.metodo != 'credito'
  GROUP BY f.cliente_id
) pag_fac ON pag_fac.cliente_id = c.id
WHERE totales.total_comprado
        > coalesce(pag_ped.total_pagado, 0) + coalesce(pag_fac.total_pagado, 0);

-- ── 4. vista_facturas: el crédito no reduce el saldo de la factura ────────────
-- Alimenta vista_morosos. Si el crédito restara el saldo, un cliente financiado
-- y vencido nunca aparecería como moroso.
-- DROP + CREATE porque CREATE OR REPLACE no puede quitar columnas (error 42P16).
-- vista_morosos depende de vista_facturas; CASCADE la eliminará y la recreamos abajo.
DROP VIEW IF EXISTS vista_morosos CASCADE;
DROP VIEW IF EXISTS vista_facturas CASCADE;
CREATE VIEW vista_facturas AS
SELECT
  f.id,
  f.numero_factura,
  f.cliente_id,
  c.nombre               as cliente_nombre,
  c.telefono_normalizado as cliente_telefono,
  f.sede_id,
  s.codigo               as sede_codigo,
  s.nombre               as sede_nombre,
  f.asesor_id,
  u.nombre               as asesor_nombre,
  f.fecha_factura,
  f.fecha_vencimiento,
  f.total,
  coalesce(pg.total_abonado, 0)::integer            as total_abonado,
  (f.total - coalesce(pg.total_abonado, 0))::integer as saldo,
  case
    when f.estado in ('pagada', 'anulada') then 0
    when f.fecha_vencimiento < current_date
      then (current_date - f.fecha_vencimiento)
    else 0
  end as dias_atraso,
  f.estado,
  f.notas,
  f.creado_en
from facturas f
join clientes c on c.id = f.cliente_id
join sedes    s on s.id = f.sede_id
join usuarios u on u.id = f.asesor_id
left join (
  select factura_id, sum(monto) as total_abonado
  from pagos_factura
  where metodo != 'credito'   -- el crédito es deuda, no abono
  group by factura_id
) pg on pg.factura_id = f.id;

-- Recrear vista_morosos (dependía de vista_facturas, fue eliminada por CASCADE)
CREATE VIEW vista_morosos AS
SELECT *
FROM vista_facturas
WHERE saldo > 0
  AND estado NOT IN ('pagada', 'anulada')
  AND fecha_vencimiento < current_date;

-- ── 5. registrar_pago_factura: saldo real excluye el crédito ──────────────────
-- Si el crédito contara como abonado, el cliente nunca podría pagar después su
-- deuda (el sistema creería la factura ya cubierta) y la factura no liquidaría.
CREATE OR REPLACE FUNCTION public.registrar_pago_factura(
  p_factura_id uuid,
  p_monto      integer,
  p_metodo     text,
  p_fecha      date,
  p_asesor_id  uuid,
  p_cuenta_id  uuid DEFAULT NULL,
  p_notas      text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  v_total   integer;
  v_estado  text;
  v_abonado integer;  -- solo pagos reales (no crédito)
begin
  select total, estado into v_total, v_estado
  from facturas where id = p_factura_id for update;

  if not found then
    raise exception 'Factura no encontrada';
  end if;
  if v_estado = 'anulada' then
    raise exception 'No se pueden registrar abonos en una factura anulada';
  end if;
  if p_monto <= 0 then
    raise exception 'El monto debe ser mayor a cero';
  end if;

  select coalesce(sum(monto), 0) into v_abonado
  from pagos_factura where factura_id = p_factura_id and metodo != 'credito';

  if p_metodo != 'credito' and p_monto > (v_total - v_abonado) then
    raise exception 'El monto supera el saldo pendiente';
  end if;

  insert into pagos_factura (factura_id, monto, metodo, fecha, asesor_id, cuenta_id, notas)
  values (p_factura_id, p_monto, p_metodo, p_fecha, p_asesor_id, p_cuenta_id, p_notas);

  if p_metodo != 'credito' and (v_abonado + p_monto) >= v_total then
    update facturas set estado = 'pagada', actualizado_en = now() where id = p_factura_id;
  end if;
end;
$$;

-- ── 6. Corrección de datos: facturas marcadas 'pagada' por contar crédito ─────
-- Revierte a 'pendiente' las facturas que se liquidaron con crédito pero cuyos
-- pagos reales (no crédito) no cubren el total. Así vuelven a aparecer en
-- cartera y, si están vencidas, en morosos.
update facturas f
set estado = 'pendiente', actualizado_en = now()
where f.estado = 'pagada'
  and f.total > coalesce((
    select sum(pf.monto)
    from pagos_factura pf
    where pf.factura_id = f.id
      and pf.metodo <> 'credito'
  ), 0);
