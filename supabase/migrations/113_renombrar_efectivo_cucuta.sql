-- Migration 113: nombres consistentes de las cajas de efectivo
-- Bucaramanga = "Efectivo Bucaramanga" (ya se llamaba así),
-- Santa Rosa = "Efectivo Santa Rosa" (ya se llamaba así),
-- Cúcuta = "Efectivo Cúcuta" (antes "Caja Cúcuta").

update cuentas set nombre = 'Efectivo Cúcuta'
where metodo_pago = 'efectivo'
  and sede_id = (select id from sedes where codigo = 'CR');
