-- Migration 150: auditoría de saldos — excluir pagos anulados y metodo='credito'
--
-- Tras el caso Ana Carvajal (migración 149) se auditó TODO cálculo de dinero.
-- Regla del negocio: un pago anulado no existe y un registro 'credito' es
-- deuda (fiado), no plata. Estos objetos los contaban como pago real:
--
--  * vista_pedidos_asesor.total_pagado  → la galería mostraba "Abono" inflado
--  * vista_facturas.total_abonado/saldo → abonos anulados seguían restando
--  * ventas_diarias_sede.total_recaudado → contaba crédito y anulados
--  * registrar_pago_pedido / pagar_pedido_con_bono → rechazaban pagos válidos
--    ("supera el saldo") si el pedido tenía un abono anulado o registro crédito
--  * registrar_pago_factura → no excluía anulados en el saldo
--  * marcar_facturas_vencidas → una factura "pagada" con crédito nunca vencía
--  * crear_factura → corregida aparte en la migración 151
--
-- NOTA: este archivo es el registro del cambio; se aplicó via MCP. Ver la
-- migración aplicada en supabase_migrations.schema_migrations.

-- ── vista_pedidos_asesor: total_pagado solo con pagos reales ─────────────────
create or replace view vista_pedidos_asesor as
 SELECT p.id,
    p.numero_orden,
    p.estado,
    p.tipo,
    p.total,
    p.tipo_entrega,
    p.direccion_entrega,
    p.notas,
    p.fecha_creacion,
    p.fecha_actualizacion,
    s.codigo AS sede_codigo,
    s.nombre AS sede_nombre,
    c.nombre AS cliente_nombre,
    c.telefono_normalizado AS cliente_telefono,
    u.nombre AS asesor_nombre,
    p.asesor_id,
    p.sede_id,
    p.cliente_id,
    p.factura_id,
    COALESCE(( SELECT sum(pg.monto) AS sum
           FROM pagos pg
          WHERE pg.pedido_id = p.id and pg.anulado = false and pg.metodo <> 'credito'), (0)::bigint) AS total_pagado,
    ( SELECT pi2.imagen_url
           FROM pedido_items pi2
          WHERE ((pi2.pedido_id = p.id) AND (pi2.imagen_url IS NOT NULL))
          ORDER BY pi2.id
         LIMIT 1) AS primera_imagen,
        CASE
            WHEN ((p.estado = 'pendiente'::text) AND (p.fecha_actualizacion < (now() - '2 days'::interval))) THEN true
            WHEN ((p.estado = 'comprado'::text) AND (p.fecha_actualizacion < (now() - '8 days'::interval))) THEN true
            WHEN ((p.estado = ANY (ARRAY['pendiente'::text, 'comprado'::text, 'usa'::text])) AND (p.fecha_creacion < (now() - '15 days'::interval))) THEN true
            WHEN ((p.estado = 'usa'::text) AND (p.fecha_actualizacion < (now() - '6 days'::interval))) THEN true
            WHEN ((p.estado = ANY (ARRAY['bucaramanga'::text, 'santa_rosa'::text])) AND (p.fecha_actualizacion < (now() - '1 day'::interval))) THEN true
            ELSE false
        END AS en_alerta,
    ((p.estado = 'pendiente'::text) AND (p.fecha_creacion < (now() - '30 days'::interval))) AS es_zombie
   FROM (((pedidos p
     JOIN sedes s ON ((s.id = p.sede_id)))
     JOIN clientes c ON ((c.id = p.cliente_id)))
     JOIN usuarios u ON ((u.id = p.asesor_id)));

-- ── vista_facturas: excluir también anulados del total_abonado ───────────────
create or replace view vista_facturas as
 SELECT f.id,
    f.numero_factura,
    f.cliente_id,
    c.nombre AS cliente_nombre,
    c.telefono_normalizado AS cliente_telefono,
    f.sede_id,
    s.codigo AS sede_codigo,
    s.nombre AS sede_nombre,
    f.asesor_id,
    u.nombre AS asesor_nombre,
    f.fecha_factura,
    f.fecha_vencimiento,
    f.total,
    (COALESCE(pg.total_abonado, (0)::bigint))::integer AS total_abonado,
    ((f.total - COALESCE(pg.total_abonado, (0)::bigint)))::integer AS saldo,
        CASE
            WHEN (f.estado = ANY (ARRAY['pagada'::text, 'anulada'::text])) THEN 0
            WHEN (f.fecha_vencimiento < CURRENT_DATE) THEN (CURRENT_DATE - f.fecha_vencimiento)
            ELSE 0
        END AS dias_atraso,
    f.estado,
    f.notas,
    f.creado_en
   FROM ((((facturas f
     JOIN clientes c ON ((c.id = f.cliente_id)))
     JOIN sedes s ON ((s.id = f.sede_id)))
     JOIN usuarios u ON ((u.id = f.asesor_id)))
     LEFT JOIN ( SELECT pagos_factura.factura_id,
            sum(pagos_factura.monto) AS total_abonado
           FROM pagos_factura
          WHERE pagos_factura.metodo <> 'credito'::text and pagos_factura.anulado = false
          GROUP BY pagos_factura.factura_id) pg ON ((pg.factura_id = f.id)));

-- ── ventas_diarias_sede: recaudado solo con pagos reales ─────────────────────
create or replace view ventas_diarias_sede as
 SELECT f.fecha_factura AS fecha,
    f.sede_id,
    s.codigo AS sede_codigo,
    s.nombre AS sede_nombre,
    (count(DISTINCT f.id))::integer AS num_facturas,
    (COALESCE(sum(f.total), (0)::bigint))::integer AS total_facturado,
    (COALESCE(sum(pf_sum.total_abonado), (0)::numeric))::integer AS total_recaudado,
    (((COALESCE(sum(f.total), (0)::bigint))::numeric - COALESCE(sum(pf_sum.total_abonado), (0)::numeric)))::integer AS saldo_pendiente
   FROM ((facturas f
     JOIN sedes s ON ((s.id = f.sede_id)))
     LEFT JOIN ( SELECT pagos_factura.factura_id,
            sum(pagos_factura.monto) AS total_abonado
           FROM pagos_factura
          WHERE pagos_factura.metodo <> 'credito'::text and pagos_factura.anulado = false
          GROUP BY pagos_factura.factura_id) pf_sum ON ((pf_sum.factura_id = f.id)))
  WHERE (f.fecha_factura = CURRENT_DATE)
  GROUP BY f.sede_id, s.codigo, s.nombre, f.fecha_factura
  ORDER BY s.codigo;

-- ── registrar_pago_pedido: saldo con pagos reales ────────────────────────────
create or replace function public.registrar_pago_pedido(p_pedido_id uuid, p_monto integer, p_metodo text, p_fecha date, p_asesor_id uuid, p_cuenta_id uuid default null::uuid, p_notas text default null::text)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_total   integer;
  v_estado  text;
  v_pagado  integer;
  v_saldo   integer;
  v_pago_id uuid;
begin
  select total, estado
  into v_total, v_estado
  from pedidos
  where id = p_pedido_id
  for update;

  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  if v_estado = 'cancelado' then
    raise exception 'No se pueden registrar pagos en pedidos cancelados';
  end if;

  if p_monto <= 0 then
    raise exception 'El monto debe ser mayor a cero';
  end if;

  -- Solo pagos reales: los anulados no existen y el crédito es deuda, no pago.
  select coalesce(sum(monto), 0)
  into v_pagado
  from pagos
  where pedido_id = p_pedido_id and anulado = false and metodo <> 'credito';

  v_saldo := v_total - v_pagado;

  if p_metodo <> 'credito' and p_monto > v_saldo then
    raise exception 'El monto (%) supera el saldo pendiente (%)', p_monto, v_saldo;
  end if;

  insert into pagos (pedido_id, monto, metodo, fecha, asesor_id, cuenta_id, notas)
  values (p_pedido_id, p_monto, p_metodo, p_fecha, p_asesor_id, p_cuenta_id, p_notas)
  returning id into v_pago_id;

  return v_pago_id;
end;
$function$;

-- ── pagar_pedido_con_bono: saldo con pagos reales ────────────────────────────
create or replace function public.pagar_pedido_con_bono(p_pedido_id uuid, p_codigo text, p_monto integer, p_asesor_id uuid, p_fecha date)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_bono_id uuid; v_bono_saldo integer; v_bono_estado text;
  v_ped_total integer; v_ped_estado text; v_ped_pagado integer; v_ped_saldo integer;
begin
  select id, saldo, estado into v_bono_id, v_bono_saldo, v_bono_estado
  from bonos_regalo where upper(codigo) = upper(btrim(p_codigo)) for update;
  if not found then raise exception 'Bono no encontrado (revisa el código)'; end if;
  if v_bono_estado = 'anulado' then raise exception 'Ese bono está anulado'; end if;
  if p_monto <= 0 then raise exception 'El monto debe ser mayor a cero'; end if;
  if p_monto > v_bono_saldo then raise exception 'El bono solo tiene % de saldo disponible', v_bono_saldo; end if;

  select total, estado into v_ped_total, v_ped_estado from pedidos where id = p_pedido_id for update;
  if not found then raise exception 'Pedido no encontrado'; end if;
  if v_ped_estado = 'cancelado' then raise exception 'No se puede pagar un pedido cancelado'; end if;
  -- Solo pagos reales: los anulados no existen y el crédito es deuda, no pago.
  select coalesce(sum(monto),0) into v_ped_pagado
  from pagos where pedido_id = p_pedido_id and anulado = false and metodo <> 'credito';
  v_ped_saldo := v_ped_total - v_ped_pagado;
  if p_monto > v_ped_saldo then raise exception 'El monto (%) supera el saldo del pedido (%)', p_monto, v_ped_saldo; end if;

  insert into pagos (pedido_id, monto, metodo, fecha, asesor_id, cuenta_id, notas)
  values (p_pedido_id, p_monto, 'bono', p_fecha, p_asesor_id, null, 'Pago con bono ' || upper(btrim(p_codigo)));

  update bonos_regalo
    set saldo = saldo - p_monto,
        estado = case when saldo - p_monto = 0 then 'agotado' else estado end
    where id = v_bono_id;

  return v_bono_saldo - p_monto;
end $function$;

-- ── registrar_pago_factura: excluir también anulados ─────────────────────────
create or replace function public.registrar_pago_factura(p_factura_id uuid, p_monto integer, p_metodo text, p_fecha date, p_asesor_id uuid, p_cuenta_id uuid default null::uuid, p_notas text default null::text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_total   integer;
  v_estado  text;
  v_abonado integer;  -- solo pagos reales (no crédito, no anulados)
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
  from pagos_factura where factura_id = p_factura_id and metodo != 'credito' and anulado = false;

  if p_metodo != 'credito' and p_monto > (v_total - v_abonado) then
    raise exception 'El monto supera el saldo pendiente';
  end if;

  insert into pagos_factura (factura_id, monto, metodo, fecha, asesor_id, cuenta_id, notas)
  values (p_factura_id, p_monto, p_metodo, p_fecha, p_asesor_id, p_cuenta_id, p_notas);

  if p_metodo != 'credito' and (v_abonado + p_monto) >= v_total then
    update facturas set estado = 'pagada', actualizado_en = now() where id = p_factura_id;
  end if;
end;
$function$;

-- ── marcar_facturas_vencidas: saldo con pagos reales ─────────────────────────
create or replace function public.marcar_facturas_vencidas()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_count integer;
begin
  with vencidas as (
    update facturas f set estado = 'vencida', actualizado_en = now()
    where f.estado = 'pendiente' and f.fecha_vencimiento < current_date
      and (f.total - coalesce((select sum(monto) from pagos_factura
            where factura_id = f.id and anulado = false and metodo <> 'credito'),0)) > 0
    returning 1
  )
  select count(*) into v_count from vencidas;
  return v_count;
end; $function$;
