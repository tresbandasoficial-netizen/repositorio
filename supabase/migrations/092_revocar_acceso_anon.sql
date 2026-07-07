-- Migration 092: revocar todo acceso del rol anon (usuarios sin login)
--
-- Las 18 vistas SECURITY DEFINER (vista_facturas, saldos_cuentas, ganancias,
-- cartera, etc.) se saltan el RLS y tenían SELECT concedido a anon: cualquiera
-- con la anon key pública (visible en el bundle del navegador y en el repo
-- público) podía leer clientes, teléfonos, facturas, costos y saldos SIN
-- INICIAR SESIÓN. También podía ejecutar las funciones SECURITY DEFINER
-- (crear_pedido, registrar_pago_pedido, liquidar_mensajeria...).
--
-- La app nunca consulta la base de datos sin sesión (el login solo usa el
-- esquema auth), así que revocar anon no rompe nada.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE USAGE ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Que las tablas/vistas/funciones futuras tampoco queden expuestas a anon.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

-- Las vistas son de solo lectura para la app: quitar privilegios de escritura
-- que venían por el GRANT ALL por defecto (defensa adicional).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES
  ON saldos_cuentas, flujo_caja_diario, vista_flujo_caja, vista_deuda_mensajerias,
     vista_ganancia_pedidos, vista_utilidad_pedidos, vista_utilidad_facturas,
     vista_costo_promedio, vista_cartera_clientes, vista_morosos, vista_facturas,
     vista_pedidos_asesor, vista_zombies, vista_pagos_unificados,
     vista_stock_por_sede, ventas_diarias_sede, mensajeria_deuda,
     domicilios_deuda_pendiente
  FROM authenticated;
