-- Migration 135: Agregar columna segmento_rfm a clientes + trigger de actualización

alter table clientes
  add column segmento_rfm cliente_segmento_rfm default 'nuevo';

-- Trigger para actualizar segmento automáticamente al cambiar pedidos
create or replace function actualizar_segmento_rfm_cliente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Cuando se crea/modifica un pedido, recalcula el segmento del cliente
  if new.cliente_id is not null then
    update clientes
    set segmento_rfm = calcular_segmento_rfm(new.cliente_id),
        actualizado_en = now()
    where id = new.cliente_id;
  end if;

  -- Cuando se borra un pedido, recalcula el segmento del cliente
  if old.cliente_id is not null then
    update clientes
    set segmento_rfm = calcular_segmento_rfm(old.cliente_id),
        actualizado_en = now()
    where id = old.cliente_id;
  end if;

  return coalesce(new, old);
end;
$$;

-- Trigger en pedidos: insert, update, delete
create trigger trg_pedido_actualizar_segmento_rfm
after insert or update or delete on pedidos
for each row
execute function actualizar_segmento_rfm_cliente();

-- Trigger en pagos_factura: insert, update, delete (actualiza el cliente del pedido)
create or replace function actualizar_segmento_al_pagar_factura()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente_id uuid;
begin
  -- Obtener cliente_id del pedido asociado a la factura
  if new.pedido_id is not null then
    select p.cliente_id into v_cliente_id from pedidos p where p.id = new.pedido_id;
  end if;

  if old.pedido_id is not null and v_cliente_id is null then
    select p.cliente_id into v_cliente_id from pedidos p where p.id = old.pedido_id;
  end if;

  -- Recalcular segmento del cliente
  if v_cliente_id is not null then
    update clientes
    set segmento_rfm = calcular_segmento_rfm(v_cliente_id),
        actualizado_en = now()
    where id = v_cliente_id;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger trg_pago_factura_actualizar_segmento_rfm
after insert or update or delete on pagos_factura
for each row
execute function actualizar_segmento_al_pagar_factura();

-- Índice para consultas rápidas
create index idx_clientes_segmento_rfm on clientes(segmento_rfm);

-- Inicializar segmentos existentes (una sola vez)
update clientes
set segmento_rfm = calcular_segmento_rfm(clientes.id)
where segmento_rfm = 'nuevo';
