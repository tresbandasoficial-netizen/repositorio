-- Migration 184: cantidades por tipo en cada caja de Envíos USA
--
-- Cada cobro de caja registra cuántos ZAPATOS, prendas de ROPA y ACCESORIOS
-- venían — para sacar cuánto vale traer cada cosa (valor de la caja ÷ unidades).

alter table envios_usa add column if not exists cant_zapatos    integer not null default 0 check (cant_zapatos >= 0);
alter table envios_usa add column if not exists cant_ropa       integer not null default 0 check (cant_ropa >= 0);
alter table envios_usa add column if not exists cant_accesorios integer not null default 0 check (cant_accesorios >= 0);
