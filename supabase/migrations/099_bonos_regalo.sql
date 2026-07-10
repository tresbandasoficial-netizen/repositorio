-- Migration 099: bonos de regalo (gift cards)
--
-- Un bono es plata que entra HOY pero cuya mercancía sale DESPUÉS, cuando el
-- portador escoge productos. Contablemente:
--   · Vender el bono: entra efectivo a una cuenta (ingreso, como "agregar
--     dinero"). NO es venta todavía (no sale producto, no descuenta inventario).
--   · Redimir: se crea la venta normal (con productos y su código), y el bono
--     la paga con el método 'bono' (cuenta_id NULL → no vuelve a entrar plata).
--     Así nunca se cuenta doble.

create table if not exists bonos_regalo (
  id            uuid primary key default gen_random_uuid(),
  codigo        text not null unique,
  valor_inicial integer not null check (valor_inicial > 0),
  saldo         integer not null check (saldo >= 0),
  estado        text not null default 'activo' check (estado in ('activo','agotado','anulado')),
  cuenta_id     uuid references cuentas(id),
  sede_id       uuid references sedes(id),
  comprador     text,
  notas         text,
  vendido_por   uuid references usuarios(id),
  creado_en     timestamptz not null default now()
);
create index if not exists idx_bonos_estado on bonos_regalo (estado);

alter table bonos_regalo enable row level security;
create policy bonos_select on bonos_regalo for select using (auth.uid() is not null);
create policy bonos_write  on bonos_regalo for all    using (auth_no_es_visor()) with check (auth_no_es_visor());

-- 'bono' como método de pago no-efectivo (cuenta_id NULL → no toca flujo de caja).
alter table pagos drop constraint if exists pagos_metodo_check;
alter table pagos add constraint pagos_metodo_check check (metodo = any (array[
  'nequi_johan','nequi_marisol','nequi_luisa','bancolombia_ronaldo','bancolombia_johan',
  'bancolombia_carlos','bancolombia_cristian','bancolombia_huber','davivienda','addi',
  'sistecredito','efectivo','credito','bold','recaudo_mensajeria','bancolombia','nequi',
  'daviplata','transferencia','datafono','otro','cuenta','bono']));

alter table pagos_factura drop constraint if exists pagos_factura_metodo_check;
alter table pagos_factura add constraint pagos_factura_metodo_check check (metodo = any (array[
  'nequi_johan','nequi_marisol','nequi_luisa','bancolombia_ronaldo','bancolombia_johan',
  'bancolombia_carlos','bancolombia_cristian','bancolombia_huber','davivienda','addi',
  'sistecredito','efectivo','credito','bold','recaudo_mensajeria','bancolombia','nequi',
  'daviplata','transferencia','datafono','otro','cuenta','bono']));

-- Vender un bono: crea el bono con código único y mete la plata a la cuenta.
create or replace function crear_bono(
  p_valor integer, p_cuenta_id uuid, p_sede_id uuid,
  p_comprador text, p_notas text, p_usuario_id uuid
) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_codigo text; v_intentos int := 0;
begin
  if p_valor <= 0 then raise exception 'El valor del bono debe ser mayor a cero'; end if;
  loop
    v_codigo := 'BONO-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));
    exit when not exists (select 1 from bonos_regalo where codigo = v_codigo);
    v_intentos := v_intentos + 1;
    if v_intentos > 20 then raise exception 'No se pudo generar el código'; end if;
  end loop;

  insert into bonos_regalo (codigo, valor_inicial, saldo, cuenta_id, sede_id, comprador, notas, vendido_por)
  values (v_codigo, p_valor, p_valor, p_cuenta_id, p_sede_id,
          nullif(btrim(coalesce(p_comprador,'')),''), nullif(btrim(coalesce(p_notas,'')),''), p_usuario_id);

  if p_cuenta_id is not null then
    insert into traslados_caja (origen_cuenta_id, destino_cuenta_id, monto, fecha, responsable_id, notas)
    values (null, p_cuenta_id, p_valor, (now() at time zone 'America/Bogota')::date, p_usuario_id, 'Venta de bono ' || v_codigo);
  end if;

  return v_codigo;
end $$;

-- Redimir: paga un pedido con el bono (atómico).
create or replace function pagar_pedido_con_bono(
  p_pedido_id uuid, p_codigo text, p_monto integer, p_asesor_id uuid, p_fecha date
) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
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
  select coalesce(sum(monto),0) into v_ped_pagado from pagos where pedido_id = p_pedido_id;
  v_ped_saldo := v_ped_total - v_ped_pagado;
  if p_monto > v_ped_saldo then raise exception 'El monto (%) supera el saldo del pedido (%)', p_monto, v_ped_saldo; end if;

  insert into pagos (pedido_id, monto, metodo, fecha, asesor_id, cuenta_id, notas)
  values (p_pedido_id, p_monto, 'bono', p_fecha, p_asesor_id, null, 'Pago con bono ' || upper(btrim(p_codigo)));

  update bonos_regalo
    set saldo = saldo - p_monto,
        estado = case when saldo - p_monto = 0 then 'agotado' else estado end
    where id = v_bono_id;

  return v_bono_saldo - p_monto;
end $$;
