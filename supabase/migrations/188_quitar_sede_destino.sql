-- Migration 188: fuera las columnas sede_destino_id (rompían los embeds)
--
-- La 186 dejó "reservadas" gastos.sede_destino_id y compras.sede_destino_id
-- (FK a sedes, sin uso en la app). Efecto no previsto: con DOS relaciones
-- gastos→sedes, el embed `sede:sedes(...)` de PostgREST se vuelve AMBIGUO y
-- la consulta falla — getGastosAction se tragaba el error y /gastos mostraba
-- "0 gastos" desde el 2-sep (reportado por Johan el 4-sep). Ambas columnas
-- estaban 100% en NULL (los selectores manuales nunca se desplegaron), así
-- que se eliminan sin pérdida. La cuenta entre sedes no las usa: se calcula
-- con vista_entre_sedes (mig. 187).
--
-- ⚠️ Lección: agregar una segunda FK hacia la misma tabla rompe TODOS los
-- embeds sin nombre de constraint (`tabla:relacion(...)`) de esa relación.

drop index if exists gastos_sede_destino_idx;
alter table gastos  drop column if exists sede_destino_id;
alter table compras drop column if exists sede_destino_id;
