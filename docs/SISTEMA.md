# Sistema Tres Bandas - Documentación Técnica Completa

**Versión**: 2026-07-25  
**Autores**: Equipo Tres Bandas + Claude Code  
**Propósito**: Guía interna de cómo funciona realmente el sistema (no aspiracional)

---

## Tabla de Contenidos

1. [Visión General](#visión-general)
2. [Arquitectura de Base de Datos](#arquitectura-de-base-de-datos)
3. [Estructura de Rutas y Componentes](#estructura-de-rutas-y-componentes)
4. [Flujos de Negocio Críticos](#flujos-de-negocio-críticos)
5. [Métodos de Pago por Sede](#métodos-de-pago-por-sede)
6. [Convenciones del Código](#convenciones-del-código)

---

## Visión General

**Tres Bandas** es un sistema de gestión para una tienda colombiana con 3 sedes físicas:
- **TR** = Bucaramanga (central)
- **SR** = Santa Rosa
- **CR** = Cúcuta

**Stack técnico**:
- Frontend: Next.js 16 (React)
- Backend: Supabase PostgreSQL + RPCs
- Autenticación: Supabase Auth (JWT)
- Despliegue: Vercel (rama `claude/beautiful-thompson-CrYqb`)

**Roles de usuario**:
- **admin**: acceso total, caja, cuadres, usuarios
- **asesor**: crea pedidos/compras en su sede, ve cartera
- **visor**: solo lectura, reportes

---

## Arquitectura de Base de Datos

### Estado Actual (128 Migraciones)

#### Tablas de Identidad

| Tabla | Columnas Clave | Foreign Keys | Notas |
|-------|---|---|---|
| **sedes** | id (PK), codigo (UNIQUE: TR/CR/SR), nombre | — | 3 registros fijos |
| **usuarios** | id (PK→auth.users), email, nombre, rol, sede_id, activo | sede_id→sedes | Un asesor por sede |
| **clientes** | id (PK), telefono_normalizado (UNIQUE), nombre, cedula, email, ciudad, direccion, cumple_dia, cumple_mes | — | Ciudad y dirección editables |

#### Tablas de Pedidos y Entregas

| Tabla | Columnas Clave | Foreign Keys | Notas |
|-------|---|---|---|
| **pedidos** | id (PK), numero_orden (UNIQUE), sede_id, cliente_id, asesor_id, estado, tipo, total, factura_id | sede→sedes, cliente→clientes, asesor→usuarios, factura→facturas | Estados: pendiente, comprado, en_camino, entregado, cancelado |
| **pedido_items** | id (PK), pedido_id, articulo_id, marca, descripcion, talla, cantidad, precio_venta | pedido→pedidos (CASCADE), articulo→articulos | Foto obligatoria (imagen_url) |
| **domicilios** | id (PK), fecha, asesor_id, cliente_nombre, direccion, mensajeria, valor_domicilio, estado | asesor→usuarios | Para entregas a domicilio |

#### Tablas de Pagos y Facturas

| Tabla | Columnas Clave | Foreign Keys | Notas |
|-------|---|---|---|
| **pagos** | id (PK), pedido_id, monto, metodo, cuenta_id, fecha, asesor_id, anulado | pedido→pedidos (CASCADE), cuenta→cuentas, asesor→usuarios | Método= efectivo\|nequi_*\|bancolombia_*\|... |
| **pagos_factura** | id (PK), factura_id, monto, metodo, cuenta_id, fecha, asesor_id, anulado | factura→facturas (CASCADE), cuenta→cuentas, asesor→usuarios | Pagos contra factura |
| **facturas** | id (PK), numero_factura (UNIQUE), cliente_id, sede_id, asesor_id, fecha_factura, fecha_vencimiento, total, estado, envio, descuento, mensajeria_entrega, valor_entrega | cliente→clientes, sede→sedes, asesor→usuarios | Estados: pendiente, pagada, vencida, anulada |

#### Tablas de Inventario

| Tabla | Columnas Clave | Foreign Keys | Notas |
|-------|---|---|---|
| **articulos** | id (PK), nombre, marca, talla, categoria, activo | — | UNIQUE(marca+nombre+talla). Categs: ropa\|tenis\|accesorios |
| **compras** | id (PK), tipo (usa\|colombia), proveedor, fecha, total_cop, total_usd, trm, creado_por | creado_por→usuarios | Orden de compra a proveedor |
| **compra_items** | id (PK), compra_id, articulo_id, pedido_id, descripcion, cantidad, costo_unitario_cop | compra→compras (CASCADE), articulo→articulos, pedido→pedidos | Asignación a pedido (opcional) |
| **movimientos_inventario** | id (PK), articulo_id, sede_id, delta, tipo, compra_item_id, pedido_id, usuario_id, costo_unitario_cop | articulo→articulos, usuario→usuarios | Tipo: entrada\|asignacion\|transferencia\|salida\|ajuste |

#### Tablas de Finanzas

| Tabla | Columnas Clave | Foreign Keys | Notas |
|-------|---|---|---|
| **cuentas** | id (PK), nombre (UNIQUE), tipo, sede_id, saldo_inicial, fecha_corte, activa, orden | sede→sedes | Cuentas bancarias (Bancolombia, Nequi, Efectivo, etc) |
| **gastos** | id (PK), fecha, valor, categoria, sede_id, cuenta_id, responsable_id, origen | sede→sedes, cuenta→cuentas, responsable→usuarios | Egreso: compras, domicilios, servicios, etc |
| **pagos_mensajeria** | id (PK), mensajeria, tipo (deuda\|pago), monto, fecha, domicilio_id, factura_id, cuenta_id, responsable_id, concepto | domicilio→domicilios, factura→facturas, cuenta→cuentas | Integración mensajerías (Exneider, Movilenvios) |
| **traslados_caja** | id (PK), origen_cuenta_id, destino_cuenta_id, monto, fecha, responsable_id | origen_cuenta→cuentas, destino_cuenta→cuentas | Movimiento interno entre cuentas |
| **cierres_caja** | id (PK), fecha, sede_id, usuario_id, detalle_cuentas (jsonb), total_ingresos, total_egresos | sede→sedes, usuario→usuarios | UNIQUE(sede_id+fecha) |
| **ajustes_caja** | id (PK), cuenta_id, fecha, diferencia, saldo_contado, usuario_id | cuenta→cuentas (CASCADE), usuario→usuarios | Cuadre físico (diferencia registrada) |

#### Tablas de Envíos y Logística

| Tabla | Columnas Clave | Foreign Keys | Notas |
|-------|---|---|---|
| **envios** | id (PK), consecutivo (BIGINT), destino_sede_id, origen_sede_id, creado_por | destino_sede→sedes, origen_sede→sedes, creado_por→usuarios | Remisión entre sedes |
| **envio_items** | id (PK), envio_id, pedido_id, numero_orden, codigo, talla, cantidad | envio→envios (CASCADE), pedido→pedidos | Items en remisión |

#### Tablas de Alertas y Notificaciones

| Tabla | Columnas Clave | Foreign Keys | Notas |
|-------|---|---|---|
| **alertas** | id (PK), pedido_id, tipo (tiempo_excedido\|zombie), resuelta_en | pedido→pedidos (CASCADE) | UNIQUE(pedido_id, tipo) WHERE resuelta_en IS NULL |
| **notificaciones** | id (PK), usuario_id, alerta_id, leida, email_enviado | usuario→usuarios (CASCADE), alerta→alertas (CASCADE) | Histórico de notificaciones |
| **historial_cambios** | id (PK), tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id | usuario→usuarios | Auditoría de cambios |

#### Tablas de Tareas y Retos

| Tabla | Columnas Clave | Foreign Keys | Notas |
|-------|---|---|---|
| **tareas** | id (PK), titulo, descripcion, asignado_a, creada_por, estado (pendiente\|completada), creado_en, completada_en | asignado_a→usuarios, creada_por→usuarios | Para asignaciones del admin |
| **retos** | id (PK), titulo, metrica (ventas\|pedidos\|unidades), categoria, modo (individual\|grupal), objetivo, sedes (text[]), premio, imagenes (text[], max 2), desde (date), hasta (date), creado_por, activo | creado_por→usuarios | Desafíos de ventas para asesores |

### Vistas Materializadas y de Lectura

```sql
-- Costo y disponibilidad
vista_costo_promedio            -- articulo_id → costo promedio (CPP)
vista_stock_por_sede            -- articulo_id, sede_id → stock actual (puede ser negativo)

-- Pedidos y entregas
vista_pedidos_asesor            -- pedidos con cliente, asesor, sede, totales
vista_zombies                   -- pedidos pendientes + 30 días sin movimiento

-- Facturación y cartera
vista_facturas                  -- facturas con saldo, días atraso
vista_morosos                   -- facturas vencidas con saldo
vista_cartera_clientes          -- cliente → total_comprado, total_pagado, saldo
vista_cartera_cliente_sede      -- cliente + sede → deuda por sede (entregada + proceso)

-- Ganancias
vista_ganancia_pedidos          -- pedido_id → venta, costo, utilidad
vista_ganancia_facturas         -- factura_id → suma pedidos vinculados
vista_utilidad_pedidos          -- (deprecada)
vista_utilidad_facturas         -- (deprecada)

-- Flujo de caja
saldos_cuentas                  -- cuenta_id → total_ingresos, egresos, saldo_neto
flujo_caja_diario               -- cuenta_id, fecha → ingresos_hoy, egresos_hoy, neto_hoy

-- Mensajerías
vista_deuda_mensajerias         -- mensajeria → total_deuda, pagado, saldo
```

### RPCs (Funciones SECURITY DEFINER)

**CRÍTICAS - Transacciones Atómicas:**

```
registrar_venta_inmediata(
  numero_orden, sede_id, asesor_id, cliente_id, total, 
  items jsonb [{articulo_id, cantidad, precio_venta, imagen_url}],
  abono, metodo_pago, cuenta_id, tipo_entrega, direccion
) → uuid pedido_id
  • Crea pedido + items + pago inicial en una transacción
  
crear_pedido(
  numero_orden, sede_id, cliente_id, asesor_id, estado, tipo, 
  total, items jsonb, abono, metodo_pago, cuenta_id, tipo_entrega, direccion, notas
) → uuid pedido_id
  • Alternativa a registrar_venta_inmediata para workflows específicos

editar_pedido(
  pedido_id, numero_orden, tipo_entrega, direccion, 
  productos jsonb [{...}], cliente_nombre, cliente_telefono
) → void
  • DELETE items viejos + INSERT nuevos (atómico)

cambiar_estado_pedido(
  pedido_id, nuevo_estado, usuario_id
) → void
  • Máquina de estados: valida transición, registra en historial_cambios
  
registrar_pago_pedido(
  pedido_id, monto, metodo, fecha, asesor_id, cuenta_id, notas
) → void
  • Bloquea con FOR UPDATE, valida saldo, actualiza total_pagado

crear_factura(
  cliente_id, sede_id, asesor_id, pedido_ids uuid[], 
  fecha_vencimiento, abono_inicial, metodo_abono, cuenta_id, notas, envio, descuento
) → uuid factura_id
  • Vincula pedidos, crea pagos iniciales, actualiza estado pedidos

crear_factura_venta_local(
  cliente_id, sede_id, asesor_id, fecha_vencimiento, 
  productos jsonb, abonos jsonb, envio, descuento, notas
) → uuid factura_id
  • Factura ad-hoc sin pedidos previos (venta local)

editar_factura(
  factura_id, cliente_id, fecha_vencimiento, pedido_ids, envio, descuento, notas
) → void
  • Recalcula total, revincula pedidos (si cambia)

registrar_pago_factura(
  factura_id, monto, metodo, fecha, asesor_id, cuenta_id, notas
) → void
  • Registra pago, actualiza estado factura (pendiente → pagada si total cubierto)

anular_factura(factura_id) → void
  • Revierte pagos, elimina domicilios, desvincula pedidos

abonar_cliente(
  cliente_id, monto, metodo, cuenta_id, usuario_id, notas
) → void
  • Abono global a cartera cliente (agrupa múltiples pagos)
```

**HELPER - Utilidades:**

```
siguiente_numero_factura(sede_id) → text
  • Retorna FAC-CODIGO-AÑO-NNNN (eg: FAC-TR-2026-0001)

hoy_bogota() → date
  • Retorna fecha de hoy en zona America/Bogota

auth_es_admin() → boolean
  • Valida rol=admin del usuario autenticado

auth_no_es_visor() → boolean
  • Valida que NO sea visor

auth_sede_id() → uuid
  • Retorna sede_id del usuario autenticado

procesar_alertas() → table(notificacion_id, usuario_id, email, nombre, pedido_numero, tipo)
  • Crea alertas automáticas para pedidos vencidos/zombis

marcar_facturas_vencidas() → int
  • Actualiza estado 'pendiente' → 'vencida' si vencimiento < hoy
```

**INVENTARIO:**

```
registrar_entrada_inventario(
  articulo_id, cantidad, costo_unitario_cop, usuario_id, compra_item_id
) → uuid movimiento_id
  • Aumenta stock central + registra movimiento

transferir_stock(
  articulo_id, sede_origen_id, sede_destino_id, cantidad, usuario_id
) → uuid transferencia_id
  • Traslada stock entre sedes (envío)

registrar_conteo_inventario(
  sede_id, conteos jsonb [{articulo_id, contado_cantidad}], usuario_id
) → void
  • Conteo físico: crea movimientos 'ajuste' por diferencia
```

**MENSUALES/ESPECIALES:**

```
liquidar_mensajeria(
  mensajeria text, p_domicilios jsonb [{id, monto}], usuario_id
) → table(domicilio_id, monto, estado)
  • Liquida domicilios seleccionados (opcional) y recaudos

liquidar_mensajeria_dia(fecha, usuario_id) → int
  • Liquida todos los domicilios + recaudos del día

crear_bono(valor, cuenta_id, sede_id, comprador, notas, usuario_id) → text codigo
  • Crea código de bono (regla de negocio: regalo interno)

pagar_pedido_con_bono(pedido_id, codigo, monto, asesor_id, fecha) → int saldo_restante
  • Consume bono como método de pago

reto_avance(reto_id) → table(usuario_id, nombre, sede, valor, completado_en)
  • Suma corrida por asesor de metrica seleccionada
  • SECURITY DEFINER: acceso a nombres de asesores sin filtro RLS

reto_avance_grupo(reto_id) → table(valor, completado_en)
  • Total equipo (modo grupal)
  • SECURITY DEFINER
```

**Convenciones de Cálculo en RPCs:**

- **Fechas**: todas en `at time zone 'America/Bogota'`
- **Dinero**: exclusiones transversales:
  - **Pagos**: excluir `anulado=true` y `metodo='credito'`
  - **Pedidos**: excluir `estado='cancelado'` y `tipo='saldo_anterior'` de ventas
  - **Costo**: prioridad (1) compra asignada, (2) costo manual admin, (3) sin costo (advertencia)

---

## Estructura de Rutas y Componentes

### Carpeta de Aplicación: `app/(dashboard)/`

#### Pedidos (6 rutas)
```
/pedidos                    → PedidosList (tabla filtrable, búsqueda por número/cliente/teléfono/código artículo)
/pedidos/nuevo             → CrearPedidoForm (paso 1: upload texto, paso 2: editar campos)
/pedidos/galeria           → GaleriaPedidos (cuadrícula visual, visor amplio, fotos 320px)
/pedidos/[id]              → Detalle pedido (cliente, items, historial cambios, ganancia)
/pedidos/[id]/editar       → EditarPedidoForm (editar número, dirección, items, cliente)
/pedidos/[id]/estado       → CambiarEstadoForm (selector + confirmación)
/pedidos/[id]/pago         → RegistrarPagoForm (monto, método, fecha, cuenta)
```

**Flujo típico de pedido:**
1. Crea en `/pedidos/nuevo` → asigna número automático (RPC)
2. Asesor puede editar en `/pedidos/[id]/editar` antes de facturar
3. Cambios de estado: `/pedidos/[id]/estado`
4. Pagos: `/pedidos/[id]/pago` (múltiples abonos posibles)
5. Detalle: `/pedidos/[id]` muestra todo + gráfica ganancia

#### Clientes (3 rutas)
```
/clientes                   → lista searchable (nombre/teléfono/cédula)
/clientes/[id]             → ficha cliente (datos, direcciones, historial, cartera)
/clientes/[id]/editar      → EditarClienteForm
```

#### Facturación (6 rutas)
```
/facturacion               → lista facturas (filtro: todas/pendientes/vencidas)
/facturacion/nueva         → NuevaFacturaForm (selecciona pedidos + abonos)
/facturacion/[id]          → detalle factura (estado, líneas, pagos, recibo imprimible)
/facturacion/[id]/editar   → EditarFacturaForm
/facturacion/[id]/recibo   → ReciboFacturaView (imprimible)
/facturacion/n/[numero]    → factura por número de serie (ej: FAC-TR-2026-0001)
```

#### Compras (3 rutas)
```
/compras                   → lista compras (búsqueda, paginación)
/compras/nueva             → CrearCompraForm (tipo USD/COP, items, asignación pedidos)
/compras/[id]              → detalle compra (items asignados, costo unitario, estado)
/compras/[id]/editar       → EditarCompraForm
```

#### Inventario y Conteo (3 rutas)
```
/inventario                → InventarioPanel (stock por sede + movimientos)
/inventario/conteo         → ConteoPanel (conteo físico, carga lote)
/inventario/etiquetas      → etiquetas imprimibles pedidos
```

#### Flujo de Caja y Finanzas (8 rutas)
```
/cartera                   → resumen deuda (clientes morosos, abonos)
/cuentas-por-cobrar        → CxC detallado por cliente
/flujo-caja                → flujo caja general
/flujo-caja/[cuentaId]     → flujo por cuenta específica
/cuadre                    → cuadre caja diario (métodos, diferencias)
/ganancias                 → ganancias por período/sede/asesor
/gastos                    → registro de gastos
/venta                     → venta inmediata (pago en el momento)
```

#### Admin (7 rutas)
```
/alertas                   → alertas pedidos vencidos/zombis
/usuarios                  → gestión de usuarios (invitar, roles)
/estadisticas              → reportes de vendidas 30/60/90 días
/tareas                    → tareas asignadas por admin
/retos                     → retos de vendedores (crear, listar, ver ranking)
/bonos                     → cálculo bonificaciones
/mensajerias               → integración mensajerías
/asistente                 → chat IA para consultas
```

#### Otros
```
/perfil                    → datos perfil usuario
/envios                    → remisiones entre sedes
/domicilios                → domicilios de clientes
```

### API Routes: `app/api/`

Solo 2 endpoints **cron** automáticos (sin REST API):

```
GET /api/cron/alertas                → 13:00 diarios (protegido CRON_SECRET)
  • Busca pedidos con estado vencido/zombie
  • Crea alertas + notificaciones automáticas
  • Envía email con Resend

GET /api/cron/cierre-automatico      → 23:59 diarios
  • Cierre automático de cajas (si no fue manual)
```

**No hay API REST tradicional**: todo usa **Server Actions** + **Supabase queries** directo desde componentes.

### Componentes Principales: `components/`

**Server vs Client:**
- **Server Components** (sin 'use client'): queries lectura en server, RLS automático
- **Client Components** ('use client'): formularios, estado local, interactividad

#### Por Módulo:

**dashboard/** (6)
- `PedidosAreaChart` → Recharts Area (líneas rectas, por sede)
- `SedeDonutChart` → Donut chart ventas por sede
- `VentasPorSemanaSede` → tabla ventas semana × sede
- `CerrarCajaButton` → botón cierre caja diario

**pedidos/** (21)
- `PedidosList` → tabla pedidos (SearchInput, paginación, filtros)
- `PedidoCard` → card individual
- `CrearPedidoForm` → 2 pasos (upload → validar/editar)
- `CambiarEstadoForm` → selector + confirmación
- `RegistrarPagoForm` → múltiples abonos
- `GaleriaPedidos` → cuadrícula (320px) + visor (900px)
- `AvisarLlegoButton` → WhatsApp mensaje cuando estado=bucaramanga
- `EtiquetasPorNumero` → etiquetas para imprimir

**clientes/** (6)
- `ClientesBusqueda` → búsqueda con SearchInput
- `EditarClienteForm` → form datos cliente
- `HistorialPagos` → tabla pagos cliente
- `ComprasChart` → gráfica ventas por mes

**facturacion/** (5)
- `NuevaFacturaForm` → selecciona pedidos, calcula saldo
- `RegistrarPagoFacturaForm` → registra abonos
- `ReciboFacturaView` → vista imprimible

**compras/** (5)
- `CrearCompraForm` → tipo USD/COP, asignación pedidos
- `AsignarItemForm` → asigna items a pedidos

**retos/** (4)
- `CrearRetoForm` → form crear reto (individual/grupal)
- `RetoUI` → card reto (fotos, ranking, medallas)
- `AvisoReto` → notificación flotante abajo-izquierda (30s refresh)

**tareas/** (2)
- `TareasClientPage` → página tareas (client)
- `AvisoTareas` → notificación flotante centrada

**layout/** (4)
- `DashboardShell` → shell layout
- `Sidebar` → menú lateral navegación
- `NavGuard` → protección rutas auth
- `CampanaNotificaciones` → campana notificaciones

---

## Flujos de Negocio Críticos

### 1. Crear Pedido (De Principio a Fin)

**Punto de entrada**: `/pedidos/nuevo`

**Paso 1: Upload y Parseo**
```
Usuario escribe/pega texto con formato:
  CLIENTE: Juan Pérez
  TELÉFONO: 3102223334
  SEDE: TR
  ARTÍCULO 1: Nike, size 42, $180.000
  ...
  TOTAL: $450.000
  ABONO: $200.000
  MÉTODO: efectivo
```

**Paso 2: Validación y Edición**
- Validar teléfono (colombiano)
- Buscar cliente por teléfono (normalizado sin tildes)
- Si NO existe: crear cliente nuevo
- Mapear artículos a `articulos.id` (búsqueda por nombre+marca+talla)
- Si NO existe: **error** (articulo obligatorio en catálogo)
- Validar cada item: talla obligatoria (ropa/tenis), foto obligatoria (asesor)
- Calcular total venta (suma items)

**Paso 3: Creación Atómica (RPC)**

```sql
CALL registrar_venta_inmediata(
  numero_orden        → Asignado automáticamente (TR6492, TR6493, etc)
  sede_id             → TR, SR o CR
  asesor_id           → Usuario actual
  cliente_id          → Existente o recién creado
  total               → Suma de (cantidad × precio_venta)
  items jsonb         → [{articulo_id, cantidad, precio_venta, imagen_url, ...}]
  abono               → Monto inicial pagado
  metodo_pago         → efectivo|nequi_*|bancolombia_*|...
  cuenta_id           → Resolvida automáticamente por método+sede
  tipo_entrega        → 'sede' | 'domicilio'
  direccion           → Si domicilio: obligatoria
)
```

**En la BD (transacción):**
1. INSERT `pedidos` (estado='pendiente', tipo='venta_inmediata')
2. INSERT `pedido_items` (cantidad, precio_venta, imagen_url)
3. Si `abono > 0`: INSERT `pagos` (monto, metodo, cuenta_id)
4. Si tipo_entrega='domicilio': INSERT `domicilios` con dirección

**Salida**: `{ok: true, pedidoId: uuid, numeroOrden: string}`

**Estados después de crear**: `pendiente` → espera pago/compra asignada

---

### 2. Procesar Compra (USD y COP)

**Punto de entrada**: `/compras/nueva`

**Tipo USD**:
```
usuario selecciona: USD
Completa:
  - Número factura (obligatorio, único en BD)
  - Total USD: $100
  - TRM: 4.200 (Colombia hoy)
  - Impuestos: $0 | $20
  - Envío: $0 | $15
  → Total COP = (USD × TRM) + impuestos + envío
```

**Tipo COP**:
```
usuario selecciona: COP
Completa:
  - Número factura (obligatorio, único)
  - Total COP: $420.000
  → Sin TRM, sin impuestos
```

**Validación de Cuadratura**:
```
suma_items = SUM(cantidad × precio_unitario)
diferencia = | suma_items - total |
Si diferencia > max(50 × cantidad_items, 200):
  ERROR: "Suma de items ($X) no cuadra con total ($Y)"
```

**Asignación a Pedidos**:
```
Para cada item de compra:
  - Usuario especifica: "destino TR6492" (busca pedido exacto)
  - O: "sin_asignar" (queda en stock)
  
Si destino=TR6492:
  - Validar: TR6492 existe, mismo articulo, cantidad suficiente
  - INSERT compra_items con pedido_id
  - UPDATE pedidos estado 'pendiente' → 'comprado'
  - RPC registrar_entrada_inventario() para movimiento
```

**Resultado en BD**:
```sql
INSERT compras (tipo, proveedor, numero_factura, total_usd, trm, total_cop, ...)
INSERT compra_items (compra_id, articulo_id, pedido_id, cantidad, costo_unitario_cop)
INSERT movimientos_inventario (articulo_id, tipo='entrada', delta=+cantidad, costo=...)
```

---

### 3. Crear Factura (Unificada, Flexible)

**Punto de entrada**: `/facturacion/nueva`

**Selecciona**:
- Cliente (existente)
- Sede
- Pedidos a facturar (≥1)
- O: Productos nuevos sin pedido (venta local)
- O: Combinación de ambos

**Cálculo de Saldo Real**:
```
saldo_pedidos = SUM(pedido.total - pagos_previos)
si hay productos nuevos:
  saldo_productos = SUM(cantidad × precio)
saldo_total = saldo_pedidos + saldo_productos - descuento + envío
si es_credito:
  permitir saldo > 0
si NOT es_credito:
  exigir abono_inicial ≥ saldo_total (error si no cuadra)
```

**Flujo Atómico**:

```sql
CALL crear_factura(
  cliente_id          → Seleccionado o nuevo
  sede_id             → TR, SR, CR
  asesor_id           → Usuario actual
  pedido_ids          → ['uuid1', 'uuid2', ...]
  fecha_vencimiento   → Hoy + plazo (admin decide)
  abono_inicial       → Monto pagado hoy
  metodo_abono        → Método de pago del abono
  cuenta_id           → Resolvida por método+sede
  envio               → Monto envío (default 0)
  descuento           → Monto descuento (default 0)
  es_credito          → true|false (permite saldo abierto)
)
```

**Resultado**:
```
INSERT facturas (numero_factura=FAC-TR-2026-0001, total, estado='pendiente')
UPDATE pedidos SET estado='entregado', factura_id (vinculación)
INSERT pagos_factura (abono_inicial)
→ numero_factura = siguiente_numero_factura(sede_id)  [RPC helper]
```

**Qué pasa después**:
- Cliente paga abonos → `/facturacion/[id]` registro de pagos
- Cuando total_pagado ≥ total → estado='pagada'
- Si vencimiento < hoy → estado='vencida' (RPC diaria `marcar_facturas_vencidas`)

---

### 4. Máquina de Estados de Pedido

```
           ┌─────────────────────────────────┐
           │      PENDIENTE (nueva)          │
           │   (sin compra asignada aún)    │
           └────────────┬────────────────────┘
                        │
                        v
           ┌─────────────────────────────────┐
           │        COMPRADO                 │
           │  (compra asignada, costo ok)   │
           └────────────┬────────────────────┘
                        │
                 [Envío a Bucaramanga]
                        │
                        v
           ┌─────────────────────────────────┐
           │      BUCARAMANGA                │
           │ (llegó a central, en tienda)   │
           └────────────┬────────────────────┘
                        │
            [Envío a Santa Rosa o Cúcuta]
                        │
                        v
           ┌─────────────────────────────────┐
           │      SANTA_ROSA | CÚCUTA        │
           │  (llegó a sucursal regional)   │
           └────────────┬────────────────────┘
                        │
              [Cliente retira/entrega]
                        │
                        v
           ┌─────────────────────────────────┐
           │      ENTREGADO                  │
           │  (cliente tiene el producto)   │
           └─────────────────────────────────┘

Excepción:
           ┌─────────────────────────────────┐
           │      CANCELADO                  │
           │ (descartado, sin reembolso)    │
           └─────────────────────────────────┘
           
  → Si facturado: anula factura (revierte pagos, desvincula)
```

**Reglas de Transición**:
- **asesor**: puede cambiar pendiente→comprado (asigna compra), comprado→usa|bucaramanga, bucaramanga→santa_rosa|cúcuta
- **asesor**: NO puede cancelar (admin solo)
- **admin**: puede cambiar a cualquier estado
- **Validación**: no entregar sin factura (excepto venta_inmediata)

**Evento Crítico: Cancelación**
```
Si pedido_estado = 'entregado' Y facturado:
  RPC anular_factura():
    - DELETE pagos_factura (revierte dinero)
    - DELETE domicilios vinculados
    - UPDATE pedidos estado='cancelado', factura_id=NULL
    - Nota: pedido NO se elimina (auditoría)
```

---

### 5. Cálculo de Ganancia por Pedido

**Dónde se calcula**: Vista `vista_ganancia_pedidos` (query en `/pedidos/[id]`)

```sql
ganancia = venta - costo

VENTA:
  SUM(pedido_items.precio_venta × cantidad)

COSTO (prioridad):
  1. Compra asignada:     costo_unitario_cop × cantidad  [de compra_items]
  2. Costo manual admin:  pedidos.costo_manual            [override]
  3. Sin costo:           0 (con advertencia "sin asignar")

UTILIDAD:
  ganancia - gastos_operativos (si aplica)
```

**Visualización**: `/pedidos/[id]` muestra:
```
┌─────────────────────────────────┐
│ GANANCIA                        │
├─────────────────────────────────┤
│ Venta: $450.000                 │
│ Costo: $180.000                 │
│ ───────────────                 │
│ Utilidad Bruta: $270.000        │
└─────────────────────────────────┘

Si compra no asignada:
  [⚠️] Sin costo asignado
  [Botón editar] para admin
```

---

### 6. Métodos de Pago por Sede

**Global (disponible en todas)**:
```
- Efectivo (caja sede)
- Nequi (Johan, Marisol, Luisa)
- Crédito (deuda, sin cuenta bancaria)
```

**Bucaramanga (TR)**:
```
Efectivo
├─ Caja Bucaramanga
Nequi
├─ Nequi Johan
├─ Nequi Marisol
Bancolombia
├─ Bancolombia Ronaldo
├─ Bancolombia Johan
├─ Bancolombia Carlos
├─ Bancolombia Cristian
├─ Bancolombia Huber
├─ Bancolombia Jhan Carlos  ← NUEVO (25 jul 2026)
Otros
├─ Davivienda
├─ Addi
├─ Bold Bucaramanga
├─ Sistecrédito
├─ Crédito
```

**Santa Rosa (SR)**:
```
Efectivo
├─ Caja Santa Rosa
Nequi
├─ Nequi Luisa
Otros
├─ Addi
├─ Bold Santa Rosa
├─ Sistecrédito
├─ Crédito
```

**Cúcuta (CR)**:
```
Efectivo
├─ Caja Cúcuta
Bancolombia
├─ Bancolombia Mayra
Otros
├─ Bold Cúcuta
├─ Crédito
```

**Flujo de Pago**:
```
Usuario selecciona metodo_pago
  ↓
Resolver cuenta automáticamente: cuentaIdPorMetodo(metodo, sede_id)
  │
  ├─ Si efectivo → Caja [Sede]
  ├─ Si nequi_* → Nequi [Nombre]
  ├─ Si bancolombia_* → Bancolombia [Nombre]
  └─ Si otro → Global (Davivienda, Addi, etc)
  ↓
INSERT pagos (cuenta_id, metodo)
```

**Detección Automática en Parser**:
```
Si usuario escribe: "Paga con Jhan Carlos"
  → detectarMetodo() busca "jhan carlos"
  → Mapea a 'bancolombia_jhan_carlos'
  → Resuelve cuenta automáticamente
```

---

## Convenciones del Código

### Estructura de Carpetas

```
repos/tres-bandas-repo/
├── app/
│   ├── (dashboard)/                # Layout protegido (auth requerido)
│   │   ├── pedidos/
│   │   │   ├── page.tsx           # Lista pedidos
│   │   │   ├── nuevo/page.tsx     # Crear pedido
│   │   │   └── [id]/...           # Detalle y acciones
│   │   ├── clientes/
│   │   ├── facturacion/
│   │   ├── compras/
│   │   ├── cartera/
│   │   ├── cuadre/
│   │   ├── inventario/
│   │   ├── retos/
│   │   ├── tareas/
│   │   ├── usuarios/
│   │   └── layout.tsx             # Shell + Sidebar
│   ├── api/
│   │   ├── cron/
│   │   │   ├── alertas/route.ts
│   │   │   └── cierre-automatico/route.ts
│   │   └── export/...
│   ├── auth/
│   │   ├── callback/page.tsx      # OAuth callback
│   │   └── logout/page.tsx
│   ├── login/page.tsx
│   ├── page.tsx                   # Redirect dashboard
│   └── layout.tsx                 # Root layout
│
├── components/
│   ├── dashboard/
│   │   ├── PedidosAreaChart.tsx
│   │   ├── SedeDonutChart.tsx
│   │   └── ...
│   ├── pedidos/
│   │   ├── PedidosList.tsx
│   │   ├── CrearPedidoForm.tsx
│   │   ├── CambiarEstadoForm.tsx
│   │   └── ... (21 componentes)
│   ├── clientes/
│   ├── facturacion/
│   ├── compras/
│   ├── inventario/
│   ├── retos/
│   ├── tareas/
│   ├── layout/
│   │   ├── DashboardShell.tsx
│   │   ├── Sidebar.tsx
│   │   └── ...
│   └── ui/
│       ├── Button.tsx             # Base components
│       ├── Card.tsx
│       ├── Badge.tsx
│       └── ...
│
├── lib/
│   ├── auth/
│   │   ├── acceso.ts              # getSesion(), validaciones rol
│   │   └── middleware.ts          # Protección rutas
│   ├── queries/
│   │   ├── pedidos.ts             # getPedidoDetalle(), getPedidoLista()
│   │   ├── clientes.ts            # getClienteDetalle()
│   │   ├── facturas.ts            # getFacturaDetalle()
│   │   ├── compras.ts
│   │   ├── ganancias.ts           # getGananciaPedido(), getGananciasNegocio()
│   │   ├── metricas.ts            # getMetricasPorSede()
│   │   └── ... (14 archivos)
│   ├── parser/
│   │   └── index.ts               # Parseo texto pedido (detectarMetodo, etc)
│   ├── supabase/
│   │   ├── server.ts              # createClient() (Node.js)
│   │   ├── client.ts              # createBrowserClient() (browser)
│   │   └── admin.ts               # Admin client (privilegios)
│   ├── utils/
│   │   ├── format.ts              # formatMiles(), hoyBogota(), formatFecha()
│   │   ├── phone.ts               # normalizarTelefono()
│   │   ├── busqueda.ts            # terminoBusquedaSeguro() (PostgREST)
│   │   ├── uploadPedidoImage.ts   # Upload a Supabase Storage
│   │   ├── cuentas.ts             # cuentaIdPorMetodo()
│   │   └── ...
│   └── constants.ts               # SEDES, METODOS_PAGO, etc
│
├── app/actions/
│   ├── pedidos.ts                 # Server Actions: crearPedidoAction, editarPedidoAction, etc
│   ├── facturas.ts                # crearFacturaAction, registrarPagoFacturaAction
│   ├── compras.ts                 # crearCompraAction, asignarItemAction
│   ├── clientes.ts
│   ├── cuadre.ts
│   ├── usuarios.ts
│   ├── retos.ts
│   └── ... (10+ archivos)
│
├── types/
│   ├── index.ts                   # TypeScript types principales
│   └── (no generado: Supabase types auto)
│
├── supabase/
│   ├── migrations/                # 128 migraciones SQL (001-128)
│   │   ├── 001_sedes.sql
│   │   ├── 035_cuentas.sql
│   │   ├── 125_retos.sql
│   │   └── ...
│   └── config.toml                # Supabase local dev config
│
├── docs/
│   ├── SISTEMA.md                 # ← Este archivo
│   └── ...
│
├── public/
│   └── images/...
│
├── package.json
├── tsconfig.json
├── next.config.js
└── .env.local (gitignore)
```

### Nomenclatura de Tablas y Campos

**Tablas**:
- Plural o singular según contexto (ej: `usuarios`, `pedidos`, `clientes`)
- Snake_case: `numero_orden`, `tipo_entrega`, `costo_unitario_cop`
- Relaciones: `{tabla}_id` (ej: `cliente_id`, `sede_id`)

**Campos Transversales** (en casi todas las tablas):
- `id` (uuid, PK)
- `creado_en` (timestamptz, now())
- `actualizado_en` (timestamptz, now(), update trigger)
- Usuario responsable: `creado_por` o `usuario_id` → `usuarios.id`

**Estados**:
- `estado` enum (ej: pedidos → 'pendiente'|'comprado'|'en_camino'|'entregado'|'cancelado')
- `activo` boolean (soft delete)
- `anulado` boolean (pagos, para no eliminar histórico)

**Dinero**:
- COP: `_cop` suffix (ej: `total_cop`, `costo_unitario_cop`)
- USD: `_usd` suffix (ej: `total_usd`)
- Sin suffix: asume COP (contexto colombiano)

**Metadatos JSON**:
- `detalle_cuentas` (jsonb) → cuadre caja
- `productos` (jsonb) → en formularios antes de ser items
- `domicilios` (jsonb) → selección en cuadre mensajerías

### Server Components vs Client Components

**Server Components** (sin 'use client'):
```tsx
// app/(dashboard)/pedidos/[id]/page.tsx
export default async function PedidoDetallePage({ params }) {
  const supabase = await createClient()
  const { data: pedido } = await supabase
    .from('pedidos')
    .select('*, pedido_items(*), cliente(*), pagos(*)')
    .eq('id', params.id)
    .single()
  
  return <PedidoDetalleView pedido={pedido} />  // Pasa datos
}
```
✅ **Ventajas**: query ejecuta en servidor (RLS automático), sin latencia, datos frescos
❌ **Limitaciones**: no puede usar hooks (useState, useEffect), no puede ser interactivo

**Client Components** ('use client'):
```tsx
'use client'

export function PedidoDetalleView({ pedido }) {
  const [editando, setEditando] = useState(false)
  
  async function guardar() {
    await editarPedidoAction(pedido.id, {...})
  }
  
  return <form onSubmit={guardar}>...</form>
}
```
✅ **Ventajas**: interactividad, hooks, estado local
❌ **Limitaciones**: no ejecuta RLS, debe llamar Server Action

**Patrón Recomendado**:
```
page.tsx (server)
  ├─ Query datos
  └─ <ClientComponent data={data} />     ← Pasa props como JSON
      ├─ useState, forms
      └─ onSubmit → serverAction()
```

### Cómo se Hacen las Queries a Supabase

**Desde Server Components** (lib/queries/*.ts):

```ts
import { createClient } from '@/lib/supabase/server'

export async function getPedidoDetalle(pedidoId: string) {
  const supabase = await createClient()
  
  // RLS automático: usuario solo ve pedidos de su sede
  const { data, error } = await supabase
    .from('pedidos')
    .select(`
      *,
      cliente:cliente_id(*),
      asesor:asesor_id(nombre, email),
      pedido_items(*, articulo:articulo_id(*)),
      pagos(*)
    `)
    .eq('id', pedidoId)
    .single()
  
  if (error) throw error
  return data as PedidoDetalle  // TypeScript
}
```

**Desde Client Components** (via Server Action):

```ts
// components/pedidos/EditarPedidoForm.tsx
'use client'

async function guardar(formData) {
  const res = await editarPedidoAction({
    pedido_id: pedidoId,
    numero_orden: formData.numero_orden,
    ...
  })
  
  if (!res.ok) {
    toast.error(res.error)
    return
  }
  toast.success('Guardado')
}

// app/actions/pedidos.ts
export async function editarPedidoAction(data) {
  'use server'
  const supabase = await createClient()
  const sesion = await getSesion()
  
  // Validaciones, RPC calls, DB updates
  const { error } = await supabase.rpc('editar_pedido', {
    p_pedido_id: data.pedido_id,
    p_numero_orden: data.numero_orden,
    ...
  })
  
  return { ok: !error, error: error?.message }
}
```

**Pattern PostgREST (filtros útiles)**:

```ts
// Búsqueda text (necesita terminoBusquedaSeguro)
.or(`numero_orden.ilike.%${termino}%, cliente_nombre.ilike.%${termino}%`)

// Filtro rango fechas
.gte('fecha', desde)
.lte('fecha', hasta)

// IN clause
.in('estado', ['pendiente', 'comprado'])

// Count para paginación
.limit(20).offset(0)
```

**Convención de Manejo de Errores**:

```ts
// No: 
const { data } = await query  // ¿Qué si hay error?

// Sí:
const { data, error } = await query
if (error) {
  console.error(error)
  return { ok: false, error: error.message }
}
```

### Tipos Comunes (TypeScript)

```tsx
// lib/queries/pedidos.ts
export type Pedido = {
  id: string
  numero_orden: string
  cliente_id: string
  asesor_id: string
  estado: 'pendiente' | 'comprado' | 'en_camino' | 'entregado' | 'cancelado'
  total: number
  creado_en: string
}

export type PedidoDetalle = Pedido & {
  cliente: Cliente
  asesor: { nombre: string; email: string }
  pedido_items: PedidoItem[]
  pagos: Pago[]
}

export type PedidoItem = {
  id: string
  pedido_id: string
  articulo_id: string
  marca: string
  descripcion: string
  talla: string
  cantidad: number
  precio_venta: number
  imagen_url: string
  articulo: Articulo
}
```

### Cómo Agregar una Feature Nueva (Ejemplo: Nuevo Método de Pago)

1. **Actualizar tipos** (`types/index.ts`):
   ```ts
   export type MetodoPago = 
     | 'efectivo' | 'nequi_*' | 'bancolombia_*' | 'nuevo_metodo'
   
   export const METODO_PAGO_LABELS = {
     // ...
     'nuevo_metodo': 'Nuevo Método',
   }
   
   export const METODOS_PAGO_POR_SEDE = {
     TR: [..., 'nuevo_metodo'],
     SR: [...],
     CR: [...],
   }
   ```

2. **Actualizar parser** (`lib/parser/index.ts`):
   ```ts
   if (/patron.*nuevo/.test(n)) return 'nuevo_metodo'
   ```

3. **Crear/actualizar migración** (`supabase/migrations/12X_nuevo_metodo.sql`):
   ```sql
   -- Si necesita nueva cuenta en tabla cuentas
   INSERT INTO cuentas (nombre, tipo, metodo_pago, sede_id) 
   VALUES ('Nuevo Método', 'tipo', 'nuevo_metodo', sede_id)
   ```

4. **Aplicar migración** (MCP de Supabase):
   ```ts
   await applyMigration({
     project_id: 'kklkpasfmtilngcemmgu',
     name: '12X_nuevo_metodo',
     query: '...'
   })
   ```

5. **Commit y push**:
   ```bash
   git add types/index.ts lib/parser/index.ts supabase/migrations/12X_nuevo_metodo.sql
   git commit -m "feat(metodos-pago): agregar nuevo metodo"
   git push origin claude/beautiful-thompson-CrYqb
   ```

---

## Referencias Rápidas

### Fecha y Hora
```ts
import { hoyBogota, formatFecha, formatMiles } from '@/lib/utils/format'

const hoy = hoyBogota()  // '2026-07-25' (hora Bogotá)
formatFecha(hoy)         // '25 de julio de 2026'
formatMiles(450000)      // '450.000'
```

### Supabase desde Server
```ts
import { createClient } from '@/lib/supabase/server'

const supabase = await createClient()
const { data, error } = await supabase.from('table').select('*')
```

### Server Actions
```ts
// app/actions/miAccion.ts
'use server'

export async function miAccion(param1: string) {
  const sesion = await getSesion()
  // ...validaciones, RPC, etc
  return { ok: true }
}

// En componente client
await miAccion(valor)
```

### RPC desde Server Action
```ts
const { data, error } = await supabase.rpc('nombreRpc', {
  p_param1: valor1,
  p_param2: valor2,
})
```

---

**Última actualización**: 25 julio 2026, migración 128  
**Rama**: `claude/beautiful-thompson-CrYqb` (producción)  
**URL viva**: https://tresbandasapp.vercel.app
