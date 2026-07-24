-- Migration 127: hasta dos fotos por reto
--
-- `imagen_url` (una sola foto) pasa a `imagenes text[]`, con tope de 2. La
-- columna vieja se CONSERVA por ahora a propósito: si se borrara antes de
-- desplegar el código nuevo, la app en producción —que todavía la
-- selecciona— quedaría caída los minutos que tarda el deploy. Se elimina en
-- una migración posterior, ya con el código nuevo arriba.

alter table retos
  add column if not exists imagenes text[] not null default '{}';

-- Pasa la foto existente al arreglo (idempotente: solo si el arreglo va vacío)
update retos
   set imagenes = array[imagen_url]
 where imagen_url is not null
   and coalesce(cardinality(imagenes), 0) = 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'retos_imagenes_max') then
    alter table retos add constraint retos_imagenes_max
      check (cardinality(imagenes) <= 2);
  end if;
end $$;
