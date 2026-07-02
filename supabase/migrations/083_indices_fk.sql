-- Migration 083: índices en llaves foráneas muy usadas (rendimiento)
--
-- Las consultas de flujo de caja, cuadre y cartera suman por cuenta_id / fecha /
-- factura_id. Sin índice, Postgres hace seq scan a medida que crecen los datos.
-- Todos con IF NOT EXISTS para que sea seguro re-ejecutar.

create index if not exists idx_pagos_cuenta             on pagos(cuenta_id);
create index if not exists idx_pagos_fecha              on pagos(fecha);
create index if not exists idx_pagos_factura_cuenta     on pagos_factura(cuenta_id);
create index if not exists idx_pagos_factura_asesor     on pagos_factura(asesor_id);
create index if not exists idx_pagos_factura_fecha      on pagos_factura(fecha);
create index if not exists idx_gastos_cuenta            on gastos(cuenta_id);
create index if not exists idx_gastos_fecha             on gastos(fecha);
create index if not exists idx_traslados_origen         on traslados_caja(origen_cuenta_id);
create index if not exists idx_traslados_destino        on traslados_caja(destino_cuenta_id);
create index if not exists idx_pagos_mensajeria_factura on pagos_mensajeria(factura_id);
