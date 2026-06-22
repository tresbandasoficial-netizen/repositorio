-- Migration 056: hacer cuenta_id obligatorio en pagos y pagos_factura
-- Desde ahora, TODO pago debe registrar a qué cuenta fue.
-- Los registros históricos sin cuenta_id se rellenan con la primera cuenta activa
-- (esto no es una auditoría exacta, pero evita romper el schema).

-- 1. Rellenar NULLs en pagos con la primera cuenta activa
do $$
declare
  v_cuenta_id uuid;
begin
  select id into v_cuenta_id from cuentas where estado = 'activa' limit 1;
  if v_cuenta_id is not null then
    update pagos set cuenta_id = v_cuenta_id where cuenta_id is null;
  end if;
end $$;

-- 2. Rellenar NULLs en pagos_factura con la primera cuenta activa
do $$
declare
  v_cuenta_id uuid;
begin
  select id into v_cuenta_id from cuentas where estado = 'activa' limit 1;
  if v_cuenta_id is not null then
    update pagos_factura set cuenta_id = v_cuenta_id where cuenta_id is null;
  end if;
end $$;

-- 3. Hacer cuenta_id NOT NULL en pagos
alter table pagos
  alter column cuenta_id set not null;

-- 4. Hacer cuenta_id NOT NULL en pagos_factura
alter table pagos_factura
  alter column cuenta_id set not null;

-- 5. Crear índices para queries frecuentes de cuadre
create index idx_pagos_cuenta on pagos (cuenta_id);
create index idx_pagos_factura_cuenta on pagos_factura (cuenta_id);
