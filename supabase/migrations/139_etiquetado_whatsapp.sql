-- Migración 139: marcar qué clientes ya quedaron etiquetados en WhatsApp
--
-- Las etiquetas de WhatsApp Business se ponen a mano (no hay API para hacerlo
-- desde afuera). Lo que el sistema aporta es la lista de a quién etiquetar y con
-- qué etiqueta, según su segmento RFM.
--
-- Esta columna es el avance de ese trabajo manual: guarda CUÁNDO se etiquetó.
-- Es timestamp y no booleano a propósito — si el cliente cambia de segmento
-- después de esa fecha, la etiqueta de WhatsApp quedó vieja y hay que volver a
-- pasar por él.

alter table clientes
  add column if not exists etiquetado_whatsapp timestamptz;

-- Para listar "los que faltan" sin escanear la tabla completa.
create index if not exists idx_clientes_etiquetado_whatsapp
  on clientes(etiquetado_whatsapp) where etiquetado_whatsapp is null;

-- Regla de la migración 111.
revoke all on clientes from anon;
