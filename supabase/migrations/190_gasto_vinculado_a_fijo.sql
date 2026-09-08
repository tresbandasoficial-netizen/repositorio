-- Migración 190: un gasto puede marcarse como el pago de un GASTO FIJO
--
-- Pedido de Johan: al registrar un gasto (o desde la lista de /gastos) poder
-- decir "este es el arriendo / la nómina / el wifi del mes" y que el fijo
-- quede marcado como pagado en /gastos-fijos automáticamente — sin ir a
-- marcarlo aparte y sin contar doble (el gasto ES el pago del fijo).
--
-- Nota: es UNA sola FK hacia gastos_fijos (tabla nueva para gastos), así que
-- no repite la ambigüedad de embeds que causó la mig. 188 (esa fue por una
-- SEGUNDA FK hacia la misma tabla sedes).

alter table gastos add column if not exists gasto_fijo_id uuid references gastos_fijos(id);

create index if not exists gastos_gasto_fijo_idx
  on gastos (gasto_fijo_id) where gasto_fijo_id is not null;
