// Esquema y reglas de negocio de la BD, compartido por los agentes (Analista, RONALDO).
export const ESQUEMA_BD = `
TABLAS PRINCIPALES (PostgreSQL):

pedidos: id, numero_orden (ej TR6492), cliente_id, sede_id, asesor_id, estado
  (pendiente|comprado|usa|bucaramanga|santa_rosa|entregado|cancelado), total (COP entero),
  tipo_entrega, factura_id, notas, fecha_creacion (timestamptz), fecha_actualizacion.
pedido_items: pedido_id, codigo (SKU), marca, descripcion, talla, color, sexo, categoria,
  cantidad, precio_venta, articulo_id.
pagos: pedido_id, monto, metodo, fecha (date), cuenta_id, asesor_id, anulado (bool), creado_en.
facturas: id, numero_factura, cliente_id, sede_id, asesor_id, total, estado
  (pendiente|pagada|vencida|anulada), fecha_factura, fecha_vencimiento, envio, descuento, creado_en.
pagos_factura: factura_id, monto, metodo, fecha, cuenta_id, anulado, creado_en.
gastos: fecha, valor, categoria (compras_mercancia|domicilios|publicidad|nomina|arriendo|transporte|otros...),
  sede_id, cuenta_id, observacion, origen, creado_en.
compras: proveedor, fecha, numero_factura, tipo (usa|colombia), total_usd, trm, total_cop, cuenta_id.
compra_items: compra_id, codigo, descripcion, marca, talla, cantidad, costo_unitario_cop,
  destino (pedido|contoda|sin_asignar), pedido_id, articulo_id.
articulos (catálogo): id, codigo (SKU), nombre, marca, color, sexo (hombre|mujer|nino),
  categoria (ropa|tenis|accesorios), activo, creado_en.
movimientos_inventario: articulo_id, talla, sede_id, delta, tipo, costo_unitario_cop, creado_en.
clientes: id, nombre, telefono_normalizado, cedula, creado_en.
domicilios: fecha, mensajeria (exneider|servigo), valor_pedido, valor_domicilio, estado,
  cliente_nombre, factura_id, creado_en.
pagos_mensajeria: mensajeria, tipo (deuda|pago), monto, fecha, estado, cuenta_id.
cuentas: id, nombre (ej 'Efectivo Bucaramanga', 'Bancolombia Carlos'), tipo, metodo_pago,
  sede_id, saldo_inicial, fecha_corte.
sedes: id, codigo (TR=Bucaramanga, SR=Santa Rosa, CR=Cúcuta), nombre.
usuarios: id, nombre, rol (admin|asesor|visor), sede_id.
traslados_caja: origen_cuenta_id, destino_cuenta_id, monto, fecha.
cierres_caja: fecha, sede_id, total_ingresos, total_egresos, neto, efectivo_esperado,
  efectivo_contado, diferencia.

VISTAS ÚTILES:
vista_pedidos_asesor: pedidos con cliente_nombre, sede_codigo, asesor_nombre, total_pagado, en_alerta, es_zombie.
vista_facturas: facturas con cliente_nombre, sede_codigo, total_abonado, saldo, dias_atraso.
vista_ganancia_pedidos: ganancia por pedido (ingreso vs costo de compra por item).
vista_cartera_clientes: saldo por cliente (total_comprado, total_pagado, saldo).
saldos_cuentas: total_ingresos/egresos/saldo_neto acumulados por cuenta.

REGLAS DE NEGOCIO (aplícalas SIEMPRE):
- ⚠️ NO DUPLICAR PEDIDOS Y FACTURAS: una venta local o facturada crea un PEDIDO y una
  FACTURA por el mismo valor, vinculados por pedidos.factura_id (los pedidos de venta
  local empiezan por 'VL-'). Son el MISMO dinero. Para ventas/deuda usa UNA sola fuente:
  · Ventas totales / deuda por cliente → pedidos (o vista_cartera_clientes).
  · Deuda de facturas por cobrar → vista_facturas.saldo.
  NUNCA sumes pedidos.total + facturas.total del mismo cliente o período.
- Dinero real: excluir pagos con anulado = true y con metodo = 'credito'.
- Pedidos: excluir estado 'cancelado' en ventas.
- Facturas: excluir estado 'anulada'.
- Todos los montos son COP enteros (sin decimales).
- La fecha de negocio es hora Bogotá: usa hoy_bogota() para "hoy"; date_trunc con
  (creado_en at time zone 'America/Bogota') para agrupar timestamps por día/mes.
- Gastos con categoria 'compras_mercancia' son el costo de mercancía (no gasto operativo).
`
