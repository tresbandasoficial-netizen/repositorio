-- Migration 133: RPC calcular_segmento_rfm — aplica lógica de segmentación

create or replace function calcular_segmento_rfm(p_cliente_id uuid)
returns cliente_segmento_rfm
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dias_recencia integer;
  v_frecuencia integer;
  v_monto numeric;
  v_segmento cliente_segmento_rfm;
begin
  -- Obtener R, F, M de la vista
  select
    coalesce(dias_desde_ultima_compra, 999),
    coalesce(frecuencia, 0),
    coalesce(monto_total, 0)
  into v_dias_recencia, v_frecuencia, v_monto
  from vista_rfm_clientes
  where cliente_id = p_cliente_id;

  -- Lógica de segmentación (RFM combinado)
  -- Campeón: Reciente + Alta Freq + Alto Monto
  if v_dias_recencia <= 60 and v_frecuencia >= 3 and v_monto >= 3000000 then
    v_segmento := 'campeon';

  -- Leal: Reciente + Alta Freq
  elsif v_dias_recencia <= 60 and v_frecuencia >= 3 then
    v_segmento := 'leal';

  -- Potencial: (Medio/Dormido) + Alta Freq + Alto Monto
  elsif v_frecuencia >= 3 and v_monto >= 3000000 and v_dias_recencia > 60 then
    v_segmento := 'potencial';

  -- Nuevo: Reciente + Baja Freq
  elsif v_dias_recencia <= 60 and v_frecuencia = 1 then
    v_segmento := 'nuevo';

  -- En Riesgo: Medio + Media Freq
  elsif v_dias_recencia between 61 and 180 and v_frecuencia = 2 then
    v_segmento := 'en_riesgo';

  -- Dormido: Sin compra 6+ meses
  elsif v_dias_recencia > 180 then
    v_segmento := 'dormido';

  -- Perdido: Dormido + Baja Freq
  elsif v_dias_recencia > 180 and v_frecuencia = 1 then
    v_segmento := 'perdido';

  else
    -- Default: clasificar por recencia + frecuencia
    if v_dias_recencia <= 60 then
      v_segmento := 'nuevo';
    elsif v_dias_recencia <= 180 then
      v_segmento := 'en_riesgo';
    else
      v_segmento := 'dormido';
    end if;
  end if;

  return v_segmento;
end;
$$;

-- Anon no puede ejecutar, solo admin/authenticated
revoke execute on function calcular_segmento_rfm(uuid) from anon;
grant execute on function calcular_segmento_rfm(uuid) to authenticated;
