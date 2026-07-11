-- Migration 103: alinear la restricción pedidos_estado_check con los estados actuales
--
-- La migración 025 simplificó los estados en el código (llego_usa→usa,
-- bodega_colombia/avisado/en_sede→bucaramanga) y actualizó el RPC
-- cambiar_estado_pedido, PERO nunca se aplicó a producción: la tabla seguía
-- con el constraint viejo (…, 'llego_usa', 'bodega_colombia', 'avisado',
-- 'en_sede', …) y quedaron filas en 'en_sede'. Por eso, al cambiar un pedido
-- a 'usa'/'bucaramanga'/'santa_rosa', el UPDATE del RPC violaba
-- pedidos_estado_check.
--
-- Esta migración migra los datos legacy y reemplaza el constraint. No toca el
-- RPC ni las vistas (ya usan los estados nuevos).

-- 1. Quitar el constraint viejo antes de migrar datos
alter table pedidos drop constraint if exists pedidos_estado_check;

-- 2. Migrar cualquier estado legacy que haya quedado
update pedidos set estado = 'usa'         where estado = 'llego_usa';
update pedidos set estado = 'bucaramanga' where estado in ('bodega_colombia', 'avisado', 'en_sede');

update historial_cambios set valor_anterior = 'usa'
  where campo = 'estado' and valor_anterior = 'llego_usa';
update historial_cambios set valor_nuevo = 'usa'
  where campo = 'estado' and valor_nuevo = 'llego_usa';
update historial_cambios set valor_anterior = 'bucaramanga'
  where campo = 'estado' and valor_anterior in ('bodega_colombia', 'avisado', 'en_sede');
update historial_cambios set valor_nuevo = 'bucaramanga'
  where campo = 'estado' and valor_nuevo in ('bodega_colombia', 'avisado', 'en_sede');

-- 3. Agregar el constraint alineado con EstadoPedido / el RPC
alter table pedidos add constraint pedidos_estado_check
  check (estado in ('pendiente', 'comprado', 'usa', 'bucaramanga', 'santa_rosa', 'entregado', 'cancelado'));
