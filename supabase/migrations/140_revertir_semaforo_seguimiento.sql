-- Migración 140: revertir el semáforo de seguimiento (migración 138)
--
-- Se construyó por un malentendido: la petición era etiquetar los chats en
-- WhatsApp para que las asesoras vieran quién es buen cliente, no llevar un
-- estado de contacto dentro del sistema. El usuario confirmó que no lo va a usar.
--
-- Se borra en vez de dejarlo apagado: columnas y botones que nadie usa confunden
-- a quien lea el código después. No se pierde nada — estaba en cero clientes
-- marcados y cero filas de histórico (verificado antes de correr esto).
--
-- Lo que reemplaza a esto es clientes.etiquetado_whatsapp (migración 139): el
-- avance del etiquetado manual en WhatsApp, que sí es lo que se pidió.

drop index if exists idx_clientes_seguimiento;

alter table clientes
  drop column if exists seguimiento,
  drop column if exists seguimiento_nota,
  drop column if exists seguimiento_en,
  drop column if exists seguimiento_por;

drop type if exists seguimiento_cliente;

-- Las políticas de la 138 abrieron alertas_recompra a las asesoras para que
-- pudieran escribir el histórico del semáforo. Sin semáforo, vuelve a ser
-- admin-only como la creó la migración 134 (mínimo privilegio).
drop policy if exists alertas_recompra_insert on alertas_recompra;
drop policy if exists alertas_recompra_select on alertas_recompra;

revoke all on clientes from anon;
revoke all on alertas_recompra from anon;
