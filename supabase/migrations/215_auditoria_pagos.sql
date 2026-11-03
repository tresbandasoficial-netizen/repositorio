-- Auditoría de pagos: guarda la fila ANTES y DESPUÉS de cada cambio o borrado
-- en pagos y pagos_factura (quién, cuándo, qué). No bloquea ni cambia ningún
-- flujo: si el registro fallara, solo avisa y el pago sigue su curso.
-- Vive en el esquema `respaldos`, que la app y la web no pueden leer.

create schema if not exists respaldos;
revoke all on schema respaldos from anon, authenticated;

create table if not exists respaldos.pagos_auditoria (
  id           bigserial primary key,
  tabla        text        not null,
  operacion    text        not null,
  fila_id      uuid,
  fila_antes   jsonb,
  fila_despues jsonb,
  usuario_id   uuid,
  fecha        timestamptz not null default now()
);
revoke all on respaldos.pagos_auditoria from anon, authenticated;

create or replace function respaldos.auditar_pago()
returns trigger
language plpgsql
security definer
set search_path = respaldos, public
as $$
begin
  begin
    if tg_op = 'UPDATE' and to_jsonb(old) = to_jsonb(new) then
      return new;
    end if;
    insert into respaldos.pagos_auditoria (tabla, operacion, fila_id, fila_antes, fila_despues, usuario_id)
    values (
      tg_table_name, tg_op,
      case when tg_op = 'DELETE' then old.id else new.id end,
      to_jsonb(old),
      case when tg_op = 'DELETE' then null else to_jsonb(new) end,
      auth.uid()
    );
  exception when others then
    raise warning 'auditar_pago falló: %', sqlerrm;
  end;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_auditar_pagos on public.pagos;
create trigger trg_auditar_pagos
  after update or delete on public.pagos
  for each row execute function respaldos.auditar_pago();

drop trigger if exists trg_auditar_pagos_factura on public.pagos_factura;
create trigger trg_auditar_pagos_factura
  after update or delete on public.pagos_factura
  for each row execute function respaldos.auditar_pago();
