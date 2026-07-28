-- Migración 145: correo de la cuenta con la que se hizo la compra
--
-- Para el contador de puntos adiClub (y sirve igual para Nike/On): cada compra
-- queda amarrada al correo de la cuenta que la hizo, y así se puede sumar
-- cuántos puntos lleva cada correo.
--
-- Los correos venían anotándose a mano en `notas` cuando alguien se acordaba.
-- Se copian a la columna nueva los que son un correo y nada más; las notas no
-- se tocan (pueden decir más cosas).

alter table compras add column if not exists correo text;

update compras
set correo = lower(trim(notas))
where correo is null
  and notas ~* '^\s*[^@\s]+@[^@\s]+\.[^@\s]+\s*$';

create index if not exists idx_compras_correo on compras(correo) where correo is not null;

-- Regla de la migración 111.
revoke all on compras from anon;
