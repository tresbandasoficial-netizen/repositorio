-- Migration 084: alinear triggers de producción con el repo
--
-- La auditoría encontró triggers creados directo en la BD (fuera de las
-- migraciones). Esta migración deja el repo como fuente de verdad:
--   1. Documenta el trigger SANO (compra_items → 'sin_asignar' al desasignar).
--   2. Elimina los triggers ROTOS que referencian columnas inexistentes.

-- ── 1. Trigger sano: al quitarle el pedido a un ítem de compra, vuelve a stock ──
-- Estaba vivo en producción pero no en el código. Lógica correcta, se conserva.
create or replace function compra_items_pedido_nullify()
returns trigger language plpgsql as $$
begin
  if new.pedido_id is null and old.pedido_id is not null then
    new.destino := 'sin_asignar';
  end if;
  return new;
end;
$$;

create or replace trigger trg_compra_items_pedido_nullify
  before update on compra_items
  for each row execute function compra_items_pedido_nullify();

-- ── 2. Triggers ROTOS (referencian columnas que no existen) → eliminar ─────────
--   - crear_gasto_domicilio_regalado: usa cuentas.estado (la columna es 'activa')
--     → bloqueaba la creación de domicilios "regalados" con valor.
--   - crear_gasto_compra: usaba compras.total (la columna es 'total_cop')
--     → bloqueaba TODA creación de compras (ya removido manualmente; se deja
--     el DROP idempotente para que quede registrado en el repo).
drop trigger if exists trg_domicilio_gasto_regalado on domicilios;
drop function if exists crear_gasto_domicilio_regalado();

drop trigger if exists trg_compra_crea_gasto on compras;
drop function if exists crear_gasto_compra();
