-- Migration 079: Artículo y dirección al crear domicilio desde factura
--
-- Cuando se factura con tipo_entrega='domicilio', el campo `articulo` del
-- registro en domicilios quedaba vacío porque _entrega_factura no lo recibía.
-- Ahora el formulario muestra campos editables pre-llenados (dirección desde
-- ultima_direccion del cliente, artículo desde los pedidos seleccionados) y los
-- guarda en el domicilio creado automáticamente.

-- ── _entrega_factura: añadir p_articulo ──────────────────────────────────────
-- DROP + CREATE (no CREATE OR REPLACE) porque agregar un parámetro cambia la
-- firma: Postgres lo trataría como sobrecarga y las llamadas con 11 args
-- seguirían resolviendo al original. Al dropar el original queda solo la
-- versión de 12 params; las llamadas con 11 args posicionales la resuelven
-- igual gracias al DEFAULT de p_articulo.
DROP FUNCTION IF EXISTS public._entrega_factura(uuid, text, uuid, uuid, uuid, integer, text, text, integer, text, text);

CREATE FUNCTION public._entrega_factura(
  p_factura_id   uuid,
  p_numero       text,
  p_cliente_id   uuid,
  p_sede_id      uuid,
  p_asesor_id    uuid,
  p_recaudo      integer,
  p_tipo_entrega text,
  p_mensajeria   text,
  p_valor        integer,
  p_quien_paga   text,
  p_direccion    text,
  p_articulo     text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $function$
declare
  v_cobrar integer;
  v_cli    record;
begin
  if p_tipo_entrega = 'domicilio' and p_mensajeria is not null then

    if p_quien_paga = 'cliente' then
      v_cobrar := coalesce(p_recaudo, 0) + coalesce(p_valor, 0);
    else
      v_cobrar := coalesce(p_recaudo, 0);
      if coalesce(p_valor, 0) > 0 then
        insert into gastos (categoria, valor, sede_id, responsable_id, fecha, origen, origen_id, observacion)
        values ('domicilios', p_valor, p_sede_id, p_asesor_id, hoy_bogota(), 'domicilio', p_factura_id,
                'Domicilio asumido por TB · ' || p_mensajeria);
        insert into pagos_mensajeria (mensajeria, tipo, monto, fecha, factura_id, responsable_id, estado, concepto, notas)
        values (p_mensajeria, 'deuda', p_valor, hoy_bogota(), p_factura_id, p_asesor_id, 'pendiente', 'domicilio_tb',
                'Domicilio asumido por TB · factura ' || p_numero);
      end if;
    end if;

    select nombre, telefono_normalizado into v_cli from clientes where id = p_cliente_id;

    insert into domicilios (
      factura_id, mensajeria, valor_pedido, valor_domicilio, valor_a_cobrar,
      origen, estado, asesor_id, fecha, metodo_pago,
      cliente_nombre, cliente_telefono, direccion, cobrar_al_cliente, tipo_cobro, numero_pedido, articulo
    )
    values (
      p_factura_id, p_mensajeria, coalesce(p_recaudo, 0), coalesce(p_valor, 0), v_cobrar,
      'factura', 'pendiente', p_asesor_id, hoy_bogota(), 'efectivo',
      coalesce(v_cli.nombre, 'Cliente'), v_cli.telefono_normalizado, p_direccion,
      (p_quien_paga = 'cliente'),
      case when p_quien_paga = 'cliente' then 'mensajero' else 'tb_cobra' end,
      p_numero, p_articulo
    );

  elsif p_tipo_entrega = 'envio'
        and coalesce(p_valor, 0) > 0
        and coalesce(p_quien_paga, '') <> 'contra_entrega' then
    insert into gastos (categoria, valor, sede_id, responsable_id, fecha, origen, origen_id, observacion)
    values ('envio', p_valor, p_sede_id, p_asesor_id, hoy_bogota(), 'envio', p_factura_id,
            case when p_quien_paga = 'cliente' then 'Envío cobrado al cliente'
                 else 'Envío asumido por TB' end);
  end if;
end;
$function$;

-- ── crear_factura: aceptar y propagar p_articulo_entrega ─────────────────────
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
  p_direccion_entrega  text    DEFAULT NULL,
  p_articulo_entrega   text    DEFAULT NULL
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
  v_total_abonado      integer := 0;
  v_total_pagado_real  integer := 0;
  v_recaudo_mensajeria integer := 0;
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

  insert into historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id)
  select 'pedidos', id, 'estado', estado, 'entregado', p_asesor_id
  from pedidos
  where id = any(p_pedido_ids)
    and estado <> 'entregado';

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
    p_quien_paga_entrega, p_direccion_entrega, p_articulo_entrega
  );

  return v_factura_id;
end;
$function$;

-- ── crear_factura_venta_local: aceptar y propagar p_articulo_entrega ──────────
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
  p_direccion_entrega  text    DEFAULT NULL,
  p_articulo_entrega   text    DEFAULT NULL
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
  v_total_abonado      integer := 0;
  v_total_pagado_real  integer := 0;
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
    p_quien_paga_entrega, p_direccion_entrega, p_articulo_entrega
  );

  insert into historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id)
  values ('facturas', v_factura_id, 'estado', null, 'pendiente', p_asesor_id);

  return v_factura_id;
end;
$function$;
