-- Migration 128: Agregar método de pago Bancolombia Jhan Carlos

-- Insertar la nueva cuenta Bancolombia Jhan Carlos para Bucaramanga
insert into cuentas (nombre, tipo, metodo_pago, sede_id, activa, orden)
select 'Bancolombia Jhan Carlos', 'bancolombia', 'bancolombia_jhan_carlos', id, true, 7
from sedes where codigo = 'TR'
on conflict do nothing;
