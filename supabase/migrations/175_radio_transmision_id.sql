-- Migration 175: radio EN VIVO. El audio viaja en pedacitos por Realtime
-- Broadcast mientras la persona habla; al terminar se guarda la grabación
-- completa como respaldo (para quien tenía el autoplay bloqueado o llegó
-- tarde). transmision_id une las dos vías: quien ya escuchó la transmisión
-- en vivo ignora la fila de respaldo para no oírla dos veces.
alter table mensajes_radio add column if not exists transmision_id text;
