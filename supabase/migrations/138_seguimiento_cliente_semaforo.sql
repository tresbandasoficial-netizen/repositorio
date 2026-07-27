-- Migración 138: semáforo de seguimiento del cliente (verde / naranja / rojo)
--
-- Etiqueta MANUAL, puesta a mano desde el perfil del cliente, para que cualquiera
-- que lo abra sepa cómo va el contacto. No reemplaza al segmento RFM
-- (migración 137), que es automático y mide comportamiento de compra:
--
--   segmento_rfm  → lo calcula el sistema:  qué tan reciente, cuántas veces, cuánto
--   seguimiento   → lo pone una persona:    ya le escribí y esto pasó
--
--   🟢 verde   = respondió / está interesado / ya compró
--   🟠 naranja = le escribí, esperando respuesta
--   🔴 rojo    = no responde / dijo que no
--   null       = sin marcar todavía
--
-- Las columnas van en `clientes` (no en tabla aparte) para poder mostrar y
-- filtrar el semáforo en la lista de clientes sin un join por fila. El histórico
-- de cada cambio queda en alertas_recompra, que ya existe para eso.

create type seguimiento_cliente as enum ('verde', 'naranja', 'rojo');

alter table clientes
  add column if not exists seguimiento       seguimiento_cliente,
  add column if not exists seguimiento_nota  text,
  add column if not exists seguimiento_en    timestamptz,
  add column if not exists seguimiento_por   uuid references usuarios(id);

-- Filtrar "muéstrame los naranja" sin escanear toda la tabla.
create index if not exists idx_clientes_seguimiento
  on clientes(seguimiento) where seguimiento is not null;

-- El histórico lo escriben las asesoras (son las que hablan por WhatsApp), no
-- solo el admin: alertas_recompra estaba en admin-only y su insert habría
-- fallado en silencio para ellas.
drop policy if exists alertas_recompra_insert on alertas_recompra;
create policy alertas_recompra_insert on alertas_recompra
  for insert with check (auth_no_es_visor());

drop policy if exists alertas_recompra_select on alertas_recompra;
create policy alertas_recompra_select on alertas_recompra
  for select using (auth.role() = 'authenticated');

-- Regla de la migración 111: verificar que anon no quede con acceso.
revoke all on alertas_recompra from anon;
revoke all on clientes from anon;
