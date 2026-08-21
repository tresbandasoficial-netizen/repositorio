-- Migration 178: TODOS los códigos (SKU) en MAYÚSCULA, igual que las tallas
-- (mig. 177). Sin riesgo de choque: el índice único de articulos ya es por
-- lower(codigo) y no existían fichas duplicadas por mayúsculas.
--
-- 1. Normaliza lo existente en articulos, pedido_items, compra_items y
--    envio_items (los códigos de sedes, cuentas y bonos NO se tocan).
-- 2. Trigger BEFORE INSERT/UPDATE: cualquier código nuevo entra en mayúscula
--    y sin espacios sobrantes, venga del formulario o RPC que venga.

create or replace function codigo_en_mayuscula()
returns trigger
language plpgsql
as $$
begin
  if new.codigo is not null then
    new.codigo := nullif(upper(btrim(new.codigo)), '');
  end if;
  return new;
end;
$$;

update articulos    set codigo = upper(btrim(codigo)) where codigo is not null and codigo <> upper(btrim(codigo));
update pedido_items set codigo = upper(btrim(codigo)) where codigo is not null and codigo <> upper(btrim(codigo));
update compra_items set codigo = upper(btrim(codigo)) where codigo is not null and codigo <> upper(btrim(codigo));
update envio_items  set codigo = upper(btrim(codigo)) where codigo is not null and codigo <> upper(btrim(codigo));

drop trigger if exists trg_codigo_mayuscula on articulos;
create trigger trg_codigo_mayuscula before insert or update on articulos
  for each row execute function codigo_en_mayuscula();

drop trigger if exists trg_codigo_mayuscula on pedido_items;
create trigger trg_codigo_mayuscula before insert or update on pedido_items
  for each row execute function codigo_en_mayuscula();

drop trigger if exists trg_codigo_mayuscula on compra_items;
create trigger trg_codigo_mayuscula before insert or update on compra_items
  for each row execute function codigo_en_mayuscula();

drop trigger if exists trg_codigo_mayuscula on envio_items;
create trigger trg_codigo_mayuscula before insert or update on envio_items
  for each row execute function codigo_en_mayuscula();
