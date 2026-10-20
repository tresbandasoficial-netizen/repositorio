-- Migration 211: los abonos del cliente se aplican primero a lo ya entregado/facturado
--
-- Antes: saldo_entregado solo descontaba los abonos hechos sobre pedidos ya
-- entregados/facturados (pagado_entregado). Un anticipo dado para un pedido que
-- aún no se entrega NO bajaba lo que el cliente debe de lo ya entregado, y al
-- cuadrarle una cuenta a crédito le aparecía debiendo plata que ya había abonado.
--
-- Ahora: la deuda de lo entregado = total entregado − TODO lo que el cliente ha
-- pagado (abonos de cualquier pedido + pagos de facturas), con piso en 0 y sin
-- pasar del saldo total. saldo_proceso sigue siendo saldo − saldo_entregado, así
-- que saldo, total_pagado y las demás columnas no cambian. Mismas columnas y tipos.

CREATE OR REPLACE VIEW vista_cartera_clientes AS
 SELECT t.cliente_id AS id,
    c.nombre,
    c.telefono_normalizado,
    c.cedula,
    t.total_comprado::integer AS total_comprado,
    (COALESCE(pp.total_pagado, 0::bigint) + COALESCE(pf.total_pagado, 0::bigint))::integer AS total_pagado,
    (t.total_comprado - COALESCE(pp.total_pagado, 0::bigint) - COALESCE(pf.total_pagado, 0::bigint))::integer AS saldo,
    t.pedidos_activos::integer AS pedidos_activos,
    LEAST(GREATEST(COALESCE(t.total_entregado, 0::bigint) - COALESCE(pp.total_pagado, 0::bigint) - COALESCE(pf.total_pagado, 0::bigint), 0::bigint), t.total_comprado - COALESCE(pp.total_pagado, 0::bigint) - COALESCE(pf.total_pagado, 0::bigint))::integer AS saldo_entregado,
    (t.total_comprado - COALESCE(pp.total_pagado, 0::bigint) - COALESCE(pf.total_pagado, 0::bigint) - LEAST(GREATEST(COALESCE(t.total_entregado, 0::bigint) - COALESCE(pp.total_pagado, 0::bigint) - COALESCE(pf.total_pagado, 0::bigint), 0::bigint), t.total_comprado - COALESCE(pp.total_pagado, 0::bigint) - COALESCE(pf.total_pagado, 0::bigint)))::integer AS saldo_proceso,
    COALESCE(t.pedidos_entregados, 0::bigint)::integer AS pedidos_entregados,
    COALESCE(t.pedidos_proceso, 0::bigint)::integer AS pedidos_proceso
   FROM ( SELECT pedidos.cliente_id,
            sum(pedidos.total) AS total_comprado,
            count(*) AS pedidos_activos,
            sum(pedidos.total) FILTER (WHERE pedidos.estado = 'entregado'::text OR pedidos.factura_id IS NOT NULL) AS total_entregado,
            count(*) FILTER (WHERE pedidos.estado = 'entregado'::text OR pedidos.factura_id IS NOT NULL) AS pedidos_entregados,
            count(*) FILTER (WHERE pedidos.estado <> 'entregado'::text AND pedidos.factura_id IS NULL) AS pedidos_proceso
           FROM pedidos
          WHERE pedidos.estado <> 'cancelado'::text
          GROUP BY pedidos.cliente_id) t
     JOIN clientes c ON c.id = t.cliente_id
     LEFT JOIN ( SELECT p.cliente_id,
            sum(pg.monto) AS total_pagado,
            sum(pg.monto) FILTER (WHERE p.estado = 'entregado'::text OR p.factura_id IS NOT NULL) AS pagado_entregado
           FROM pagos pg
             JOIN pedidos p ON p.id = pg.pedido_id
          WHERE p.estado <> 'cancelado'::text AND pg.metodo <> 'credito'::text AND pg.anulado = false
          GROUP BY p.cliente_id) pp ON pp.cliente_id = t.cliente_id
     LEFT JOIN ( SELECT f.cliente_id,
            sum(pf_1.monto) AS total_pagado
           FROM pagos_factura pf_1
             JOIN facturas f ON f.id = pf_1.factura_id
          WHERE f.estado <> 'anulada'::text AND pf_1.metodo <> 'credito'::text AND pf_1.anulado = false
          GROUP BY f.cliente_id) pf ON pf.cliente_id = t.cliente_id
  WHERE t.total_comprado > (COALESCE(pp.total_pagado, 0::bigint) + COALESCE(pf.total_pagado, 0::bigint));

CREATE OR REPLACE VIEW vista_cartera_cliente_sede AS
 SELECT t.cliente_id AS id,
    c.nombre,
    c.telefono_normalizado,
    c.cedula,
    s.id AS sede_id,
    s.codigo AS sede_codigo,
    s.nombre AS sede_nombre,
    t.total_comprado::integer AS total_comprado,
    (COALESCE(pp.total_pagado, 0::bigint) + COALESCE(pf.total_pagado, 0::bigint))::integer AS total_pagado,
    (t.total_comprado - COALESCE(pp.total_pagado, 0::bigint) - COALESCE(pf.total_pagado, 0::bigint))::integer AS saldo,
    t.pedidos_activos::integer AS pedidos_activos,
    LEAST(GREATEST(COALESCE(t.total_entregado, 0::bigint) - COALESCE(pp.total_pagado, 0::bigint) - COALESCE(pf.total_pagado, 0::bigint), 0::bigint), t.total_comprado - COALESCE(pp.total_pagado, 0::bigint) - COALESCE(pf.total_pagado, 0::bigint))::integer AS saldo_entregado,
    (t.total_comprado - COALESCE(pp.total_pagado, 0::bigint) - COALESCE(pf.total_pagado, 0::bigint) - LEAST(GREATEST(COALESCE(t.total_entregado, 0::bigint) - COALESCE(pp.total_pagado, 0::bigint) - COALESCE(pf.total_pagado, 0::bigint), 0::bigint), t.total_comprado - COALESCE(pp.total_pagado, 0::bigint) - COALESCE(pf.total_pagado, 0::bigint)))::integer AS saldo_proceso,
    COALESCE(t.pedidos_entregados, 0::bigint)::integer AS pedidos_entregados,
    COALESCE(t.pedidos_proceso, 0::bigint)::integer AS pedidos_proceso
   FROM ( SELECT pedidos.cliente_id,
            pedidos.sede_id,
            sum(pedidos.total) AS total_comprado,
            count(*) AS pedidos_activos,
            sum(pedidos.total) FILTER (WHERE pedidos.estado = 'entregado'::text OR pedidos.factura_id IS NOT NULL) AS total_entregado,
            count(*) FILTER (WHERE pedidos.estado = 'entregado'::text OR pedidos.factura_id IS NOT NULL) AS pedidos_entregados,
            count(*) FILTER (WHERE pedidos.estado <> 'entregado'::text AND pedidos.factura_id IS NULL) AS pedidos_proceso
           FROM pedidos
          WHERE pedidos.estado <> 'cancelado'::text
          GROUP BY pedidos.cliente_id, pedidos.sede_id) t
     JOIN clientes c ON c.id = t.cliente_id
     JOIN sedes s ON s.id = t.sede_id
     LEFT JOIN ( SELECT p.cliente_id,
            p.sede_id,
            sum(pg.monto) AS total_pagado,
            sum(pg.monto) FILTER (WHERE p.estado = 'entregado'::text OR p.factura_id IS NOT NULL) AS pagado_entregado
           FROM pagos pg
             JOIN pedidos p ON p.id = pg.pedido_id
          WHERE p.estado <> 'cancelado'::text AND pg.metodo <> 'credito'::text AND pg.anulado = false
          GROUP BY p.cliente_id, p.sede_id) pp ON pp.cliente_id = t.cliente_id AND pp.sede_id = t.sede_id
     LEFT JOIN ( SELECT f.cliente_id,
            f.sede_id,
            sum(pf_1.monto) AS total_pagado
           FROM pagos_factura pf_1
             JOIN facturas f ON f.id = pf_1.factura_id
          WHERE f.estado <> 'anulada'::text AND pf_1.metodo <> 'credito'::text AND pf_1.anulado = false
          GROUP BY f.cliente_id, f.sede_id) pf ON pf.cliente_id = t.cliente_id AND pf.sede_id = t.sede_id
  WHERE t.total_comprado > (COALESCE(pp.total_pagado, 0::bigint) + COALESCE(pf.total_pagado, 0::bigint));
