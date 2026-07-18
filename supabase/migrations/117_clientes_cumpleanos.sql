-- Migración 117: cumpleaños del cliente (día y mes; el año casi nunca se sabe
-- y no hace falta para felicitarlo). Se rellenan poco a poco desde la edición
-- del cliente.
alter table public.clientes
  add column if not exists cumple_dia smallint check (cumple_dia between 1 and 31),
  add column if not exists cumple_mes smallint check (cumple_mes between 1 and 12);

comment on column public.clientes.cumple_dia is 'Día del cumpleaños (1-31)';
comment on column public.clientes.cumple_mes is 'Mes del cumpleaños (1-12)';
