-- Migration 061: trigger para crear gasto automático en domicilios "regalado" (tb_regala)
-- Cuando se registra un domicilio con tipo_cobro = 'regalado', TB asume el costo
-- Se genera automáticamente un gasto en la tabla gastos

create or replace function crear_gasto_domicilio_regalado()
returns trigger as $$
declare
  v_sede_id uuid;
  v_primera_cuenta_id uuid;
begin
  if new.tipo_cobro = 'regalado' and new.valor_domicilio > 0 then
    -- Obtener sede_id del pedido asociado
    select sede_id into v_sede_id from pedidos where id = new.pedido_id limit 1;

    -- Si no hay sede_id del pedido, usar la primera cuenta activa como default
    if v_sede_id is null then
      v_sede_id := (select id from sedes limit 1);
    end if;

    -- Obtener primera cuenta activa para registrar el gasto
    select id into v_primera_cuenta_id from cuentas where estado = 'activa' limit 1;

    if v_primera_cuenta_id is not null and v_sede_id is not null then
      insert into gastos (fecha, categoria, valor, cuenta_id, sede_id, responsable_id, observacion, origen, origen_id)
      values (
        current_date,
        'domicilios',
        new.valor_domicilio,
        v_primera_cuenta_id,
        v_sede_id,
        new.asesor_id,
        'Domicilio regalado a ' || new.cliente_nombre || ' — ' || new.direccion,
        'domicilio',
        new.id
      );
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_domicilio_gasto_regalado on domicilios;
create trigger trg_domicilio_gasto_regalado after insert on domicilios
for each row execute function crear_gasto_domicilio_regalado();
