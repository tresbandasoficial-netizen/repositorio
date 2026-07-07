-- Migration 094: índices para foreign keys consultadas por la app
-- (advisor unindexed_foreign_keys; solo las columnas que las consultas usan)

create index if not exists idx_pagos_mensajeria_cuenta    on pagos_mensajeria (cuenta_id);
create index if not exists idx_pagos_mensajeria_domicilio on pagos_mensajeria (domicilio_id);
create index if not exists idx_gastos_sede                on gastos (sede_id);
create index if not exists idx_domicilios_factura         on domicilios (factura_id);
create index if not exists idx_domicilios_cuenta          on domicilios (cuenta_id);
create index if not exists idx_notificaciones_alerta      on notificaciones (alerta_id);
create index if not exists idx_facturas_asesor            on facturas (asesor_id);
create index if not exists idx_pagos_asesor               on pagos (asesor_id);
create index if not exists idx_historial_usuario          on historial_cambios (usuario_id);
create index if not exists idx_mov_inventario_sede        on movimientos_inventario (sede_id);
create index if not exists idx_compras_cuenta             on compras (cuenta_id);
