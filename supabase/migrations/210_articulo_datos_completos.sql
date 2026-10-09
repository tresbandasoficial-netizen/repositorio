-- 210: categoría, color y sexo del artículo siempre completos.
-- Problema: 617 de 1.794 artículos activos tenían categoría/color/sexo vacíos
-- (fichas creadas a medias) y, cuando el asesor completaba esos datos en la
-- línea del pedido/venta, quedaban solo en pedido_items y nunca volvían a la ficha.
--   1) AFTER INSERT/UPDATE en pedido_items: lo que se captura en la línea llena
--      lo que le falte a la ficha del artículo (solo rellena vacíos, nunca pisa).
--   2) BEFORE INSERT en pedido_items: si la línea trae articulo_id y no trae
--      categoría/sexo/color, se llenan solos desde la ficha.
--   3) Relleno único de las fichas vacías con lo ya capturado en pedido_items.
-- Revertir: drop trigger trg_articulo_completar_desde_item on pedido_items;
--           drop trigger trg_pedido_item_datos_articulo on pedido_items;
--           drop function articulo_completar_desde_item(); drop function pedido_item_datos_articulo();

create or replace function public.articulo_completar_desde_item()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.articulo_id is null then
    return new;
  end if;

  update articulos a set
    categoria = coalesce(a.categoria, new.categoria),
    sexo      = coalesce(a.sexo, new.sexo),
    color     = case when a.color is null or btrim(a.color) = ''
                     then nullif(btrim(new.color), '') else a.color end
  where a.id = new.articulo_id
    and ( (a.categoria is null and new.categoria is not null)
       or (a.sexo is null and new.sexo is not null)
       or ((a.color is null or btrim(a.color) = '') and nullif(btrim(new.color), '') is not null) );

  return new;
end;
$$;

create or replace function public.pedido_item_datos_articulo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_art articulos%rowtype;
begin
  if new.articulo_id is null then
    return new;
  end if;
  if new.categoria is not null and new.sexo is not null and nullif(btrim(new.color), '') is not null then
    return new;
  end if;

  select * into v_art from articulos where id = new.articulo_id;
  if not found then
    return new;
  end if;

  new.categoria := coalesce(new.categoria, v_art.categoria);
  -- el sexo de la línea solo admite hombre/mujer/nino
  if new.sexo is null and v_art.sexo in ('hombre', 'mujer', 'nino') then
    new.sexo := v_art.sexo;
  end if;
  if nullif(btrim(new.color), '') is null then
    new.color := nullif(btrim(v_art.color), '');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_articulo_completar_desde_item on public.pedido_items;
create trigger trg_articulo_completar_desde_item
  after insert or update of articulo_id, categoria, sexo, color on public.pedido_items
  for each row execute function public.articulo_completar_desde_item();

drop trigger if exists trg_pedido_item_datos_articulo on public.pedido_items;
create trigger trg_pedido_item_datos_articulo
  before insert on public.pedido_items
  for each row execute function public.pedido_item_datos_articulo();

-- Relleno único: para cada ficha con vacíos, el valor más usado en sus líneas.
with moda_cat as (
  select articulo_id, categoria, row_number() over (partition by articulo_id order by count(*) desc, max(categoria)) rn
  from pedido_items where articulo_id is not null and categoria is not null group by articulo_id, categoria
), moda_sexo as (
  select articulo_id, sexo, row_number() over (partition by articulo_id order by count(*) desc, max(sexo)) rn
  from pedido_items where articulo_id is not null and sexo is not null group by articulo_id, sexo
), moda_color as (
  select articulo_id, nullif(btrim(color), '') as color,
         row_number() over (partition by articulo_id order by count(*) desc, max(btrim(color))) rn
  from pedido_items where articulo_id is not null and nullif(btrim(color), '') is not null group by articulo_id, nullif(btrim(color), '')
)
update articulos a set
  categoria = coalesce(a.categoria, (select categoria from moda_cat m where m.articulo_id = a.id and m.rn = 1)),
  sexo      = coalesce(a.sexo,      (select sexo      from moda_sexo m where m.articulo_id = a.id and m.rn = 1)),
  color     = case when a.color is null or btrim(a.color) = ''
                   then (select color from moda_color m where m.articulo_id = a.id and m.rn = 1) else a.color end
where a.categoria is null or a.sexo is null or a.color is null or btrim(a.color) = '';
