-- Migration 177: TODAS las tallas en MAYÚSCULA, en todos lados
-- (pedido de Johan 20-ago: había duplicados m/M, s/S, xs/XS que partían el
-- stock del mismo artículo en dos filas).
--
-- 1. Normaliza lo existente (movimientos, pedidos, compras, envíos, articulos.talla).
-- 2. Trigger BEFORE INSERT/UPDATE en cada tabla con columna talla: cualquier
--    talla nueva entra en mayúscula sin importar por qué formulario o RPC venga.

create or replace function talla_en_mayuscula()
returns trigger
language plpgsql
as $$
begin
  if new.talla is not null then
    new.talla := nullif(upper(btrim(new.talla)), '');
  end if;
  return new;
end;
$$;

update movimientos_inventario set talla = upper(btrim(talla)) where talla is not null and talla <> upper(btrim(talla));
update pedido_items          set talla = upper(btrim(talla)) where talla is not null and talla <> upper(btrim(talla));
update compra_items          set talla = upper(btrim(talla)) where talla is not null and talla <> upper(btrim(talla));
update envio_items           set talla = upper(btrim(talla)) where talla is not null and talla <> upper(btrim(talla));
update articulos             set talla = upper(btrim(talla)) where talla is not null and talla <> upper(btrim(talla));

drop trigger if exists trg_talla_mayuscula on movimientos_inventario;
create trigger trg_talla_mayuscula before insert or update on movimientos_inventario
  for each row execute function talla_en_mayuscula();

drop trigger if exists trg_talla_mayuscula on pedido_items;
create trigger trg_talla_mayuscula before insert or update on pedido_items
  for each row execute function talla_en_mayuscula();

drop trigger if exists trg_talla_mayuscula on compra_items;
create trigger trg_talla_mayuscula before insert or update on compra_items
  for each row execute function talla_en_mayuscula();

drop trigger if exists trg_talla_mayuscula on envio_items;
create trigger trg_talla_mayuscula before insert or update on envio_items
  for each row execute function talla_en_mayuscula();

drop trigger if exists trg_talla_mayuscula on articulos;
create trigger trg_talla_mayuscula before insert or update on articulos
  for each row execute function talla_en_mayuscula();
