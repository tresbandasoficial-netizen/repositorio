-- Migration 157: gastos fijos por sede
--
-- `gastos_fijos.sede_id`: cada gasto fijo pertenece a una sede, y la página
-- /gastos-fijos calcula el punto de equilibrio POR SEDE (pestañas TR/SR/CR y
-- "Todo el negocio"). Los gastos existentes (lista de Johan/Ronaldo del 1-ago)
-- eran de Bucaramanga + generales del negocio: quedan todos en TR.

alter table gastos_fijos add column if not exists sede_id uuid references sedes(id);

update gastos_fijos
set sede_id = (select id from sedes where codigo = 'TR')
where sede_id is null;

create index if not exists idx_gastos_fijos_sede on gastos_fijos (sede_id);
