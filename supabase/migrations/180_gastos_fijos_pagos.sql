-- Migration 180: registro mensual de gastos fijos pagados
--
-- Cada fila = "este gasto fijo ya se pagó en este mes". El mes va como el
-- primer día del mes (date). Solo admin (la tabla madre contiene sueldos).

create table if not exists gastos_fijos_pagos (
  id            uuid primary key default gen_random_uuid(),
  gasto_fijo_id uuid not null references gastos_fijos(id) on delete cascade,
  mes           date not null,
  pagado_en     timestamptz not null default now(),
  usuario_id    uuid references usuarios(id),
  unique (gasto_fijo_id, mes)
);

alter table gastos_fijos_pagos enable row level security;

drop policy if exists gastos_fijos_pagos_admin on gastos_fijos_pagos;
create policy gastos_fijos_pagos_admin on gastos_fijos_pagos for all
  using (auth_es_admin()) with check (auth_es_admin());

grant select, insert, update, delete on gastos_fijos_pagos to authenticated;
revoke all on gastos_fijos_pagos from anon;
