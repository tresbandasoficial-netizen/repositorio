-- Auditor diario por sede (primero Santa Rosa). Solo LEE el dinero y guarda un
-- informe; no modifica pedidos, facturas ni pagos.
--
-- generar_auditoria(sede, fecha) calcula:
--   · resumen del día: pedidos, facturas, cobros por método, cierre de caja
--   · hallazgos con severidad (alta / media):
--       pedidos entregados sin factura, pedidos viejos sin factura,
--       deudas por antigüedad (con quién y hace cuánto no paga),
--       facturas con estado incoherente, pagos sin cuenta,
--       pagos editados/borrados (registro de la mig. 215), facturas anuladas,
--       cierres sin conteo o con diferencia.
-- y lo guarda en auditoria_diaria (un informe por sede y día).

create table if not exists public.auditoria_diaria (
  id         uuid primary key default gen_random_uuid(),
  sede_id    uuid not null references public.sedes(id),
  fecha      date not null,
  informe    jsonb not null,
  n_alta     int  not null default 0,
  n_media    int  not null default 0,
  creado_en  timestamptz not null default now(),
  unique (sede_id, fecha)
);

alter table public.auditoria_diaria enable row level security;
drop policy if exists auditoria_diaria_select on public.auditoria_diaria;
create policy auditoria_diaria_select on public.auditoria_diaria
  for select using (auth_es_admin());

create or replace function public.generar_auditoria(p_sede uuid, p_fecha date)
returns jsonb
language plpgsql
security definer
set search_path = public, respaldos
as $$
declare
  v_desde   timestamptz := (p_fecha::timestamp at time zone 'America/Bogota');
  v_hasta   timestamptz := ((p_fecha + 1)::timestamp at time zone 'America/Bogota');
  v_hoy     date := (now() at time zone 'America/Bogota')::date;
  v_h       jsonb := '[]'::jsonb;
  v_det     jsonb;
  v_n       int;
  v_m       numeric;
  v_resumen jsonb;
  v_informe jsonb;
  v_alta    int := 0;
  v_media   int := 0;
begin
  -- Saldo por factura: total - pagos de la factura - pagos de sus pedidos
  -- (el crédito es deuda, no pago).
  drop table if exists _aud_fs;
  create temp table _aud_fs on commit drop as
  select f.id, f.cliente_id, f.numero_factura, f.fecha_factura, f.total, f.estado,
         f.total
           - coalesce((select sum(pf.monto) from pagos_factura pf
                        where pf.factura_id = f.id and coalesce(pf.anulado,false) = false and pf.metodo <> 'credito'), 0)
           - coalesce((select sum(pg.monto) from pagos pg join pedidos pp on pp.id = pg.pedido_id
                        where pp.factura_id = f.id and coalesce(pg.anulado,false) = false and pg.metodo <> 'credito'), 0) as saldo,
         (select max(x.fecha) from (
            select pf.fecha::date fecha from pagos_factura pf
             where pf.factura_id = f.id and coalesce(pf.anulado,false) = false and pf.metodo <> 'credito'
            union all
            select pg.fecha::date from pagos pg join pedidos pp on pp.id = pg.pedido_id
             where pp.factura_id = f.id and coalesce(pg.anulado,false) = false and pg.metodo <> 'credito') x) as ult_pago
    from facturas f
   where f.sede_id = p_sede and f.estado <> 'anulada';

  -- ── Resumen del día ────────────────────────────────────────────────────
  select jsonb_build_object(
    'pedidos_n',     (select count(*) from pedidos p where p.sede_id = p_sede and p.estado <> 'cancelado'
                       and p.numero_orden not like 'SALDO-%' and p.fecha_creacion >= v_desde and p.fecha_creacion < v_hasta),
    'pedidos_total', (select coalesce(sum(p.total),0) from pedidos p where p.sede_id = p_sede and p.estado <> 'cancelado'
                       and p.numero_orden not like 'SALDO-%' and p.fecha_creacion >= v_desde and p.fecha_creacion < v_hasta),
    'por_asesor',    (select coalesce(jsonb_agg(jsonb_build_object('asesor', a.nombre, 'pedidos', a.n, 'total', a.t) order by a.t desc), '[]'::jsonb)
                       from (select u.nombre, count(*) n, sum(p.total) t from pedidos p left join usuarios u on u.id = p.asesor_id
                              where p.sede_id = p_sede and p.estado <> 'cancelado' and p.numero_orden not like 'SALDO-%'
                                and p.fecha_creacion >= v_desde and p.fecha_creacion < v_hasta group by u.nombre) a),
    'facturas_n',    (select count(*) from _aud_fs where fecha_factura = p_fecha),
    'facturas_total',(select coalesce(sum(total),0) from _aud_fs where fecha_factura = p_fecha),
    'cobros_total',  (select coalesce(sum(c.monto),0) from (
                        select pf.monto from pagos_factura pf join facturas f on f.id = pf.factura_id
                         where f.sede_id = p_sede and pf.fecha::date = p_fecha and coalesce(pf.anulado,false) = false and pf.metodo <> 'credito'
                        union all
                        select pg.monto from pagos pg join pedidos pp on pp.id = pg.pedido_id
                         where pp.sede_id = p_sede and pg.fecha::date = p_fecha and coalesce(pg.anulado,false) = false and pg.metodo <> 'credito') c),
    'cobros_por_metodo', (select coalesce(jsonb_object_agg(m.metodo, m.t), '{}'::jsonb) from (
                        select c.metodo, sum(c.monto) t from (
                          select pf.metodo, pf.monto from pagos_factura pf join facturas f on f.id = pf.factura_id
                           where f.sede_id = p_sede and pf.fecha::date = p_fecha and coalesce(pf.anulado,false) = false and pf.metodo <> 'credito'
                          union all
                          select pg.metodo, pg.monto from pagos pg join pedidos pp on pp.id = pg.pedido_id
                           where pp.sede_id = p_sede and pg.fecha::date = p_fecha and coalesce(pg.anulado,false) = false and pg.metodo <> 'credito') c
                        group by c.metodo) m),
    'deuda_total',   (select coalesce(sum(saldo),0) from _aud_fs where estado = 'pendiente' and saldo > 0),
    'deuda_facturas',(select count(*) from _aud_fs where estado = 'pendiente' and saldo > 0),
    'deuda_0_7',     (select coalesce(sum(saldo),0) from _aud_fs where estado = 'pendiente' and saldo > 0 and v_hoy - fecha_factura <= 7),
    'deuda_8_15',    (select coalesce(sum(saldo),0) from _aud_fs where estado = 'pendiente' and saldo > 0 and v_hoy - fecha_factura between 8 and 15),
    'deuda_16_30',   (select coalesce(sum(saldo),0) from _aud_fs where estado = 'pendiente' and saldo > 0 and v_hoy - fecha_factura between 16 and 30),
    'deuda_mas_30',  (select coalesce(sum(saldo),0) from _aud_fs where estado = 'pendiente' and saldo > 0 and v_hoy - fecha_factura > 30),
    'cierre',        (select jsonb_build_object('existe', true, 'esperado', cc.efectivo_esperado, 'contado', cc.efectivo_contado,
                              'diferencia', cc.diferencia, 'ingresos', cc.total_ingresos)
                        from cierres_caja cc where cc.sede_id = p_sede and cc.fecha = p_fecha limit 1)
  ) into v_resumen;

  -- ── 1. Pedidos entregados sin factura (ALTA) ───────────────────────────
  select count(*), coalesce(sum(t.total),0),
         coalesce(jsonb_agg(jsonb_build_object('doc', t.numero_orden, 'cliente', t.nombre, 'valor', t.total, 'dias', v_hoy - (t.fecha_creacion at time zone 'America/Bogota')::date)
                  order by t.fecha_creacion) filter (where t.rn <= 15), '[]'::jsonb)
    into v_n, v_m, v_det
    from (select p.numero_orden, c.nombre, p.total, p.fecha_creacion,
                 row_number() over (order by p.fecha_creacion) rn
            from pedidos p left join clientes c on c.id = p.cliente_id
           where p.sede_id = p_sede and p.factura_id is null and p.estado = 'entregado'
             and p.numero_orden not like 'SALDO-%' and p.numero_orden not like 'VL-%'
             and p.fecha_creacion > now() - interval '90 days') t;
  if v_n > 0 then
    v_h := v_h || jsonb_build_array(jsonb_build_object('codigo','entregado_sin_factura','severidad','alta',
      'titulo','Pedidos ENTREGADOS sin factura (últimos 90 días)','cantidad',v_n,'monto',v_m,'detalle',v_det));
    v_alta := v_alta + 1;
  end if;

  -- ── 2. Pedidos en proceso sin factura hace más de 7 días (MEDIA) ───────
  select count(*), coalesce(sum(t.total),0),
         coalesce(jsonb_agg(jsonb_build_object('doc', t.numero_orden, 'cliente', t.nombre, 'estado', t.estado, 'valor', t.total, 'dias', v_hoy - (t.fecha_creacion at time zone 'America/Bogota')::date)
                  order by t.fecha_creacion) filter (where t.rn <= 15), '[]'::jsonb)
    into v_n, v_m, v_det
    from (select p.numero_orden, c.nombre, p.estado, p.total, p.fecha_creacion,
                 row_number() over (order by p.fecha_creacion) rn
            from pedidos p left join clientes c on c.id = p.cliente_id
           where p.sede_id = p_sede and p.factura_id is null and p.estado not in ('cancelado','entregado')
             and p.numero_orden not like 'SALDO-%' and p.numero_orden not like 'VL-%'
             and p.fecha_creacion > now() - interval '120 days'
             and p.fecha_creacion < now() - interval '7 days') t;
  if v_n > 0 then
    v_h := v_h || jsonb_build_array(jsonb_build_object('codigo','pedido_sin_factura','severidad','media',
      'titulo','Pedidos en proceso sin factura hace más de 7 días','cantidad',v_n,'monto',v_m,'detalle',v_det));
    v_media := v_media + 1;
  end if;

  -- ── 3. Deudas: por cliente, con antigüedad y último pago ───────────────
  --      ALTA si hay deuda de más de 30 días; MEDIA si la más vieja pasa de 15.
  select count(*), coalesce(sum(t.saldo),0),
         coalesce(jsonb_agg(jsonb_build_object('cliente', t.nombre, 'telefono', t.telefono_normalizado, 'cliente_id', t.cliente_id,
                  'valor', t.saldo, 'facturas', t.nf, 'dias', t.dias, 'ultimo_pago', t.ult_pago)
                  order by t.saldo desc) filter (where t.rn <= 20), '[]'::jsonb)
    into v_n, v_m, v_det
    from (select d.cliente_id, c.nombre, c.telefono_normalizado, d.saldo, d.nf, d.dias, d.ult_pago,
                 row_number() over (order by d.saldo desc) rn
            from (select fs.cliente_id, sum(fs.saldo) saldo, count(*) nf, v_hoy - min(fs.fecha_factura) dias, max(fs.ult_pago) ult_pago
                    from _aud_fs fs where fs.estado = 'pendiente' and fs.saldo > 0 group by fs.cliente_id) d
            join clientes c on c.id = d.cliente_id
           where d.dias > 15) t;
  if v_n > 0 then
    v_h := v_h || jsonb_build_array(jsonb_build_object('codigo','deuda_vencida',
      'severidad', case when (v_resumen->>'deuda_mas_30')::numeric > 0 then 'alta' else 'media' end,
      'titulo','Clientes con deuda de más de 15 días','cantidad',v_n,'monto',v_m,'detalle',v_det));
    if (v_resumen->>'deuda_mas_30')::numeric > 0 then v_alta := v_alta + 1; else v_media := v_media + 1; end if;
  end if;

  -- ── 4. Estado de factura incoherente con sus pagos (MEDIA) ─────────────
  select count(*), coalesce(sum(abs(t.saldo)),0),
         coalesce(jsonb_agg(jsonb_build_object('doc', t.numero_factura, 'cliente', t.nombre, 'estado', t.estado, 'valor', t.saldo, 'dias', v_hoy - t.fecha_factura)
                  order by abs(t.saldo) desc) filter (where t.rn <= 15), '[]'::jsonb)
    into v_n, v_m, v_det
    from (select fs.numero_factura, c.nombre, fs.estado, fs.saldo, fs.fecha_factura,
                 row_number() over (order by abs(fs.saldo) desc) rn
            from _aud_fs fs left join clientes c on c.id = fs.cliente_id
           where (fs.estado = 'pagada' and fs.saldo > 1000) or (fs.estado = 'pendiente' and fs.saldo < -1000)) t;
  if v_n > 0 then
    v_h := v_h || jsonb_build_array(jsonb_build_object('codigo','factura_incoherente','severidad','media',
      'titulo','Facturas cuyo estado no coincide con sus pagos','cantidad',v_n,'monto',v_m,'detalle',v_det));
    v_media := v_media + 1;
  end if;

  -- ── 5. Pagos del día sin cuenta asignada (MEDIA) ────────────────────────
  select count(*), coalesce(sum(t.monto),0),
         coalesce(jsonb_agg(jsonb_build_object('doc', t.doc, 'metodo', t.metodo, 'valor', t.monto)) filter (where t.rn <= 15), '[]'::jsonb)
    into v_n, v_m, v_det
    from (select x.doc, x.metodo, x.monto, row_number() over (order by x.monto desc) rn from (
            select f.numero_factura doc, pf.metodo, pf.monto from pagos_factura pf join facturas f on f.id = pf.factura_id
             where f.sede_id = p_sede and pf.fecha::date = p_fecha and pf.cuenta_id is null
               and coalesce(pf.anulado,false) = false and pf.metodo <> 'credito'
            union all
            select pp.numero_orden, pg.metodo, pg.monto from pagos pg join pedidos pp on pp.id = pg.pedido_id
             where pp.sede_id = p_sede and pg.fecha::date = p_fecha and pg.cuenta_id is null
               and coalesce(pg.anulado,false) = false and pg.metodo <> 'credito') x) t;
  if v_n > 0 then
    v_h := v_h || jsonb_build_array(jsonb_build_object('codigo','pago_sin_cuenta','severidad','media',
      'titulo','Pagos del día sin cuenta asignada','cantidad',v_n,'monto',v_m,'detalle',v_det));
    v_media := v_media + 1;
  end if;

  -- ── 6. Pagos editados o borrados en el día (registro mig. 215) ─────────
  select count(*), coalesce(sum(case when t.operacion = 'DELETE' then 1 else 0 end),0),
         coalesce(jsonb_agg(jsonb_build_object('doc', t.tabla, 'operacion', t.operacion, 'antes', t.antes, 'despues', t.despues, 'usuario', t.usuario, 'hora', t.fecha)
                  order by t.fecha desc) filter (where t.rn <= 15), '[]'::jsonb)
    into v_n, v_m, v_det
    from (select a.tabla, a.operacion, a.fila_antes->>'monto' antes, a.fila_despues->>'monto' despues, u.nombre usuario, a.fecha,
                 row_number() over (order by a.fecha desc) rn
            from respaldos.pagos_auditoria a left join usuarios u on u.id = a.usuario_id
           where a.fecha >= v_desde and a.fecha < v_hasta
             and ((a.tabla = 'pagos' and exists (select 1 from pedidos p where p.id = (a.fila_antes->>'pedido_id')::uuid and p.sede_id = p_sede))
               or (a.tabla = 'pagos_factura' and exists (select 1 from facturas f where f.id = (a.fila_antes->>'factura_id')::uuid and f.sede_id = p_sede)))) t;
  if v_n > 0 then
    v_h := v_h || jsonb_build_array(jsonb_build_object('codigo','pagos_modificados',
      'severidad', case when v_m > 0 then 'alta' else 'media' end,
      'titulo','Pagos editados o borrados en el día','cantidad',v_n,'monto',v_m,'detalle',v_det));
    if v_m > 0 then v_alta := v_alta + 1; else v_media := v_media + 1; end if;
  end if;

  -- ── 7. Facturas anuladas en el día (MEDIA) ──────────────────────────────
  select count(*), coalesce(sum(t.total),0),
         coalesce(jsonb_agg(jsonb_build_object('doc', t.numero_factura, 'cliente', t.nombre, 'valor', t.total)) filter (where t.rn <= 15), '[]'::jsonb)
    into v_n, v_m, v_det
    from (select f.numero_factura, c.nombre, f.total, row_number() over (order by f.total desc) rn
            from facturas f left join clientes c on c.id = f.cliente_id
           where f.sede_id = p_sede and f.estado = 'anulada'
             and f.actualizado_en >= v_desde and f.actualizado_en < v_hasta) t;
  if v_n > 0 then
    v_h := v_h || jsonb_build_array(jsonb_build_object('codigo','factura_anulada','severidad','media',
      'titulo','Facturas anuladas en el día','cantidad',v_n,'monto',v_m,'detalle',v_det));
    v_media := v_media + 1;
  end if;

  -- ── 8. Cierres de caja de los últimos 7 días ────────────────────────────
  --      ALTA si el conteo no coincide; MEDIA si hubo ingresos y nadie contó.
  select count(*), coalesce(sum(abs(t.diferencia)),0),
         coalesce(jsonb_agg(jsonb_build_object('doc', t.fecha, 'esperado', t.efectivo_esperado, 'contado', t.efectivo_contado, 'valor', t.diferencia)
                  order by t.fecha desc), '[]'::jsonb)
    into v_n, v_m, v_det
    from cierres_caja t
   where t.sede_id = p_sede and t.fecha > p_fecha - 7 and t.fecha <= p_fecha
     and coalesce(t.diferencia,0) <> 0 and t.efectivo_contado is not null;
  if v_n > 0 then
    v_h := v_h || jsonb_build_array(jsonb_build_object('codigo','cierre_diferencia','severidad','alta',
      'titulo','Cierres de caja con diferencia (7 días)','cantidad',v_n,'monto',v_m,'detalle',v_det));
    v_alta := v_alta + 1;
  end if;

  select count(*), coalesce(sum(t.total_ingresos),0),
         coalesce(jsonb_agg(jsonb_build_object('doc', t.fecha, 'valor', t.total_ingresos) order by t.fecha desc), '[]'::jsonb)
    into v_n, v_m, v_det
    from cierres_caja t
   where t.sede_id = p_sede and t.fecha > p_fecha - 7 and t.fecha <= p_fecha
     and t.efectivo_contado is null and coalesce(t.total_ingresos,0) > 0;
  if v_n > 0 then
    v_h := v_h || jsonb_build_array(jsonb_build_object('codigo','cierre_sin_conteo','severidad','media',
      'titulo','Días con ingresos y sin conteo de efectivo (7 días)','cantidad',v_n,'monto',v_m,'detalle',v_det));
    v_media := v_media + 1;
  end if;

  v_informe := jsonb_build_object('fecha', p_fecha, 'generado', now(), 'resumen', v_resumen, 'hallazgos', v_h);

  insert into auditoria_diaria (sede_id, fecha, informe, n_alta, n_media)
  values (p_sede, p_fecha, v_informe, v_alta, v_media)
  on conflict (sede_id, fecha) do update
    set informe = excluded.informe, n_alta = excluded.n_alta, n_media = excluded.n_media, creado_en = now();

  return v_informe;
end;
$$;

revoke all on function public.generar_auditoria(uuid, date) from public, anon, authenticated;
grant execute on function public.generar_auditoria(uuid, date) to service_role;
