-- Migración 191: el check de gasto fijo pagado se mantiene por TRIGGER
--
-- Arregla los hallazgos de la revisión de la 190:
--   1. Eliminar un gasto vinculado (por /gastos, por anular una compra o por
--      los triggers de domicilios) dejaba el check del fijo huérfano — la
--      sincronización vivía solo en dos acciones de la app. Ahora un trigger
--      en la tabla gastos mantiene gastos_fijos_pagos en TODOS los caminos
--      (insert/update/delete, vengan de donde vengan) y dentro de la misma
--      transacción.
--   2. via_gasto distingue los checks creados por un gasto vinculado de los
--      marcados A MANO en /gastos-fijos: el trigger solo borra los suyos
--      (via_gasto=true); una marca manual nunca se pierde por desvincular.
--   3. La FK queda ON DELETE SET NULL: eliminar un gasto fijo ya no se
--      bloquea por tener gastos históricos vinculados (pierden la marca).
--   4. RLS: solo el admin puede insertar gastos con gasto_fijo_id — antes la
--      regla vivía solo en la app y un asesor podía setearlo por la API.

-- ── 2. checks automáticos vs manuales ────────────────────────────────────────
alter table gastos_fijos_pagos add column if not exists via_gasto boolean not null default false;

-- Backfill: los checks cuyo (fijo, mes) tiene un gasto vinculado los creó el
-- flujo nuevo (antes de la mig. 190 no existían vínculos).
update gastos_fijos_pagos p
set via_gasto = true
where exists (
  select 1 from gastos g
  where g.gasto_fijo_id = p.gasto_fijo_id
    and g.fecha >= p.mes and g.fecha < (p.mes + interval '1 month')::date
);

-- ── 3. FK on delete set null ─────────────────────────────────────────────────
alter table gastos drop constraint if exists gastos_gasto_fijo_id_fkey;
alter table gastos add constraint gastos_gasto_fijo_id_fkey
  foreign key (gasto_fijo_id) references gastos_fijos(id) on delete set null;

-- ── 1. trigger de sincronización ─────────────────────────────────────────────
create or replace function sincronizar_pago_fijo() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mes date;
begin
  -- Limpiar el lado VIEJO (delete, o update que cambió fijo/mes)
  if tg_op in ('DELETE', 'UPDATE') and old.gasto_fijo_id is not null then
    v_mes := date_trunc('month', old.fecha)::date;
    if tg_op = 'DELETE'
       or old.gasto_fijo_id is distinct from new.gasto_fijo_id
       or date_trunc('month', new.fecha)::date <> v_mes then
      -- El check automático solo vive mientras algún gasto del mes lo respalde
      if not exists (
        select 1 from gastos g
        where g.gasto_fijo_id = old.gasto_fijo_id
          and g.fecha >= v_mes and g.fecha < (v_mes + interval '1 month')::date
          and g.id <> old.id
      ) then
        delete from gastos_fijos_pagos
        where gasto_fijo_id = old.gasto_fijo_id and mes = v_mes and via_gasto = true;
      end if;
    end if;
  end if;

  -- Asegurar el lado NUEVO (insert o update con fijo)
  if tg_op in ('INSERT', 'UPDATE') and new.gasto_fijo_id is not null then
    v_mes := date_trunc('month', new.fecha)::date;
    insert into gastos_fijos_pagos (gasto_fijo_id, mes, usuario_id, via_gasto)
    values (new.gasto_fijo_id, v_mes, new.responsable_id, true)
    on conflict (gasto_fijo_id, mes) do nothing; -- una marca manual previa se respeta
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sincronizar_pago_fijo on gastos;
create trigger trg_sincronizar_pago_fijo
after insert or update of gasto_fijo_id, fecha or delete on gastos
for each row execute function sincronizar_pago_fijo();

-- ── 4. RLS: gasto_fijo_id solo lo setea el admin ─────────────────────────────
drop policy if exists gastos_insert on gastos;
create policy gastos_insert on gastos for insert
  with check (auth_no_es_visor() and (gasto_fijo_id is null or auth_es_admin()));
