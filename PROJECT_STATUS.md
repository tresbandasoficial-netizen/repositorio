# PROJECT_STATUS.md — Tres Bandas App
> Auditoría técnica generada el 2026-06-21

---

## 1. ARQUITECTURA GENERAL

La aplicación es un **ERP interno** para una cadena de ropa y calzado (Tres Bandas, Bucaramanga, Colombia) con 3 sedes: TR (Bucaramanga), CR (Cúcuta), SR (Santa Rosa).

**Patrón arquitectónico:** Next.js App Router con Server Components + Server Actions. No hay API REST propia expuesta al público; toda la lógica de backend vive en Server Actions (`'use server'`). La base de datos es Supabase (PostgreSQL con RLS).

```
Cliente (browser)
    ↓ Server Components (RSC)
Next.js 16 App Router
    ↓ Server Actions ('use server')
Supabase PostgreSQL
    ↓ RLS + PL/pgSQL functions
Row-Level Security por rol/sede
```

---

## 2. TECNOLOGÍAS UTILIZADAS

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Framework | Next.js | 16.2.6 |
| UI | React | 19.2.4 |
| Lenguaje | TypeScript | 5.x |
| Estilos | Tailwind CSS | 4.x |
| Base de datos | Supabase (PostgreSQL) | 2.106.1 |
| Auth | Supabase SSR | 0.10.3 |
| IA principal | Anthropic Claude SDK | 0.98.0 |
| IA secundaria (facturas) | OpenAI SDK | 6.39.0 |
| Email | Resend | 6.12.3 |
| Gráficas | Recharts | 3.8.1 |
| Iconos | lucide-react | latest |
| Deploy | Vercel | — |

---

## 3. ESTRUCTURA DE CARPETAS

```
/
├── app/
│   ├── (dashboard)/            # Layout protegido (requiere auth)
│   │   ├── alertas/
│   │   ├── asistente/          # IA Claude
│   │   ├── cartera/            # Admin-only
│   │   ├── clientes/
│   │   ├── compras/            # Admin-only
│   │   ├── dashboard/
│   │   ├── domicilios/
│   │   ├── estadisticas/
│   │   ├── pedidos/
│   │   ├── perfil/
│   │   └── usuarios/           # Admin-only
│   ├── actions/                # Server Actions (toda la lógica de negocio)
│   │   ├── asistente.ts
│   │   ├── clientes.ts
│   │   ├── compras.ts
│   │   ├── domicilios.ts
│   │   ├── parsear-factura.ts
│   │   ├── pedidos.ts
│   │   └── usuarios.ts
│   ├── api/
│   │   ├── cron/alertas/       # Vercel Cron Job
│   │   ├── export/pedidos/     # CSV export
│   │   └── setup-admin/
│   └── auth/                   # Login, callback, set-password
├── components/
│   ├── asistente/
│   ├── clientes/
│   ├── compras/
│   ├── domicilios/
│   ├── layout/                 # Sidebar, MobileNav
│   ├── pedidos/
│   └── ui/                     # Button, Card, Badge, etc.
├── lib/
│   ├── auth/                   # getSesion(), puedeAccederSede()
│   ├── domain/                 # estados.ts (transiciones de estado)
│   ├── email/                  # Templates Resend
│   ├── parser/                 # Parser de texto libre → ParsedPedido
│   ├── queries/                # Data fetching (read-only)
│   ├── supabase/               # client.ts, server.ts, admin.ts
│   └── utils/                  # phone.ts, format.ts, cn.ts
├── types/
│   └── index.ts                # Todos los tipos TypeScript
└── supabase/
    └── migrations/             # 26 migraciones SQL
```

---

## 4. TABLAS DE SUPABASE

### Tablas principales

| Tabla | Filas estimadas | Descripción |
|-------|----------------|-------------|
| `sedes` | 3 | TR, CR, SR (hardcoded) |
| `usuarios` | ~10-20 | Empleados con rol y sede |
| `clientes` | Creciente | Base de clientes únicos por teléfono |
| `pedidos` | Alto volumen | Tabla central del negocio |
| `pedido_items` | Alto volumen | Productos por pedido |
| `pagos` | Alto volumen | Abonos registrados |
| `alertas` | Moderado | Alertas activas/resueltas |
| `notificaciones` | Moderado | Notificaciones por usuario |
| `historial_cambios` | Alto volumen | Auditoría de todos los cambios |
| `compras` | Moderado | Facturas de proveedores |
| `compra_items` | Moderado | Productos de cada compra |
| `domicilios` | Moderado | Registro de envíos diarios |

### Schema detallado

#### `sedes`
```sql
id uuid PK, codigo ('TR'|'CR'|'SR'), nombre, direccion
```

#### `usuarios`
```sql
id uuid PK (FK auth.users), email, nombre,
rol ('asesor'|'admin'|'visor'), sede_id FK, activo bool
```

#### `clientes`
```sql
id uuid PK, telefono_normalizado text UNIQUE, nombre,
cedula, email, notas, creado_en, actualizado_en
-- Índice: GIN trigram para búsqueda difusa por nombre
```

#### `pedidos`
```sql
id uuid PK, numero_orden text UNIQUE, sede_id FK, cliente_id FK,
asesor_id FK, estado EstadoPedido, total int,
tipo_entrega ('sede'|'domicilio'), direccion_entrega text,
notas text, numero_guia text,
fecha_creacion timestamptz, fecha_actualizacion timestamptz
-- Trigger: actualiza fecha_actualizacion automáticamente
-- Índices: sede+fecha, asesor, cliente, estado, numero_orden
```

#### `pedido_items`
```sql
id uuid PK, pedido_id FK CASCADE, marca, descripcion, talla,
cantidad int, precio_venta int, imagen_url text
```

#### `pagos`
```sql
id uuid PK, pedido_id FK CASCADE, monto int, metodo MetodoPago,
fecha date, asesor_id FK, notas text
-- MetodoPago: efectivo|transferencia|datafono|addi|bold|
--             sistecredito|credito|otro
```

#### `alertas`
```sql
id uuid PK, pedido_id FK, tipo ('tiempo_excedido'|'zombie'),
creada_en timestamptz, resuelta_en timestamptz
-- UNIQUE: (pedido_id, tipo) WHERE resuelta_en IS NULL
```

#### `compras`
```sql
id uuid PK, tipo ('usa'|'colombia'), proveedor, fecha date,
numero_factura text UNIQUE, total_usd numeric, trm numeric,
total_cop int, notas, creado_por FK usuarios
```

#### `compra_items`
```sql
id uuid PK, compra_id FK CASCADE, descripcion, marca, talla,
cantidad int, costo_unitario_cop int,
destino ('pedido'|'contoda'|'sin_asignar'),
pedido_id FK (opcional), pedido_item_indice smallint,
transferido_contoda bool, transferido_en timestamptz
```

#### `domicilios`
```sql
id uuid PK, fecha date, asesor_id FK, cliente_nombre,
cliente_telefono, direccion, mensajeria ('exneider'|'servigo'),
valor_pedido int, valor_domicilio int, cobrar_al_cliente bool,
metodo_pago text, articulo text, numero_pedido text,
notas text, estado ('pendiente'|'entregado')
```

---

## 5. RELACIONES ENTRE TABLAS

```
sedes ──< usuarios
sedes ──< pedidos

clientes ──< pedidos
usuarios (asesor) ──< pedidos
pedidos ──< pedido_items
pedidos ──< pagos
pedidos ──< alertas
pedidos ──< historial_cambios (por registro_id)

alertas ──< notificaciones
usuarios ──< notificaciones

usuarios (admin) ──< compras
compras ──< compra_items
compra_items >── pedidos (opcional, destino=pedido)

usuarios (asesor) ──< domicilios
```

---

## 6. VISTAS DE BASE DE DATOS

| Vista | Uso principal |
|-------|--------------|
| `vista_pedidos_asesor` | Pedidos con datos de cliente, asesor, sede, total_pagado, en_alerta, es_zombie |
| `vista_zombies` | Pedidos con es_zombie = true |
| `vista_cartera_clientes` | Clientes con saldo pendiente > 0 |

**Umbrales de alerta (hardcoded en SQL migración 025):**
- `pendiente`: 2 días sin cambio
- `comprado`: 8 días sin cambio
- `usa`: 6 días sin cambio
- `bucaramanga` / `santa_rosa`: 1 día sin cambio
- Zombie: `pendiente` por más de 30 días desde creación

---

## 7. FUNCIONES PL/pgSQL

| Función | Descripción |
|---------|-------------|
| `crear_pedido()` | Transaccional: inserta pedido + items + pago inicial + historial |
| `cambiar_estado_pedido()` | Cambia estado + registra en historial_cambios |
| `procesar_alertas()` | Materializa alertas + crea notificaciones + retorna data para emails |
| `auth_es_admin()` | Helper RLS — verifica si el usuario activo es admin |
| `auth_sede_id()` | Helper RLS — retorna sede_id del usuario activo |

---

## 8. APIS Y RUTAS ESPECIALES

| Ruta | Método | Propósito |
|------|--------|-----------|
| `/api/cron/alertas` | GET | Vercel Cron: procesar alertas + enviar emails (Resend) |
| `/api/export/pedidos` | GET | Exportar CSV con filtros (fecha, sede, estado) |
| `/api/setup-admin` | POST | Setup inicial del sistema |

---

## 9. SERVER ACTIONS (Backend)

| Acción | Módulo | Descripción |
|--------|--------|-------------|
| `crearPedidoAction()` | Pedidos | Parse texto libre → crear pedido completo |
| `crearPedidoDesdeDataAction()` | Pedidos | Crear desde datos ya estructurados |
| `cambiarEstadoAction()` | Pedidos | Validar transición + RPC (con redirect) |
| `cambiarEstadoInlineAction()` | Pedidos | Igual pero sin redirect |
| `registrarPagoAction()` | Pedidos | Validar saldo + insertar pago |
| `editarPedidoAction()` | Pedidos | Actualizar pedido + items (delete+insert) |
| `eliminarPedidoAction()` | Pedidos | Solo admin |
| `buscarClientesAction()` | Clientes | Búsqueda ilike + última dirección de domicilio |
| `buscarDireccionPorTelefonoAction()` | Clientes | Lookup dirección por teléfono |
| `editarClienteAction()` | Clientes | Actualizar datos de cliente |
| `crearCompraAction()` | Compras | Crear compra + items (verifica numero_factura único) |
| `asignarItemAction()` | Compras | Vincular item a pedido (actualiza estado si pendiente) |
| `eliminarCompraAction()` | Compras | Solo admin |
| `parsearFacturaAction()` | Compras | IA (Claude) → extrae JSON estructurado de foto/PDF de factura |
| `crearDomicilioAction()` | Domicilios | Insertar registro de domicilio |
| `editarDomicilioAction()` | Domicilios | Actualizar domicilio |
| `invitarUsuarioAction()` | Usuarios | Crear usuario + enviar email de invitación |
| `toggleActivoAction()` | Usuarios | Activar/desactivar usuario |
| `eliminarUsuarioAction()` | Usuarios | Eliminar (no admin, no self) |
| `resumenAsistenteAction()` | Asistente | IA: resumen ejecutivo de pedidos pendientes |
| `alertasAsistenteAction()` | Asistente | IA: lista de casos urgentes |
| `chatAsistenteAction()` | Asistente | IA: chat con tool-use (cambiar estado, pago, nota) |

---

## 10. MÓDULOS — ESTADO DE COMPLETITUD

| Módulo | Estado | Completitud | Notas |
|--------|--------|-------------|-------|
| Pedidos | ✅ Completo | 100% | Núcleo del negocio, bien estructurado |
| Clientes | ✅ Completo | 100% | Búsqueda, historial, edición |
| Dashboard | ✅ Completo | 100% | KPIs diferenciados por rol |
| Alertas | ✅ Completo | 100% | Cron automático + emails |
| Estadísticas | ✅ Completo | 100% | Gráficas, períodos, desglose |
| Cartera | ✅ Completo | 100% | Vista de saldo por cliente (lectura) |
| Compras | ✅ Completo | 100% | Parser IA de facturas, asignación |
| Usuarios | ✅ Completo | 100% | Invitación, roles, sedes |
| Domicilios | ⚠️ Parcial | 80% | Schema inconsistente entre migraciones |
| Perfil | ⚠️ Básico | 50% | Solo ver datos y cambiar contraseña |
| Asistente IA | ✅ Completo | 100% | Requiere ANTHROPIC_API_KEY |
| **Facturación** | ❌ No existe | 0% | Propuesto abajo |
| **Cuentas por Cobrar** | ❌ No existe | 0% | Propuesto abajo |

---

## 11. PROBLEMAS DETECTADOS

### Schema / Base de datos

1. **Domicilios: schema inconsistente entre migraciones** — La migración 016 define la tabla base, pero migraciones posteriores (017-018) agregan columnas que en algunos ambientes pueden no existir. Riesgo de errores en nuevos deploys.

2. **Umbrales de alerta duplicados** — Los días de alerta están definidos tanto en `types/index.ts` (como documentación) como en la migración SQL (como lógica real). Si se cambia uno sin el otro, hay desincronización silenciosa.

3. **Estados de pedido en múltiples lugares** — `EstadoPedido` se define en `types/index.ts`, en `lib/domain/estados.ts`, en la vista SQL y en los server actions. Agregar un estado nuevo requiere editar al menos 4 archivos.

4. **Métodos de pago hard-coded en varios archivos** — `MetodoPago` definido en tipos, en el parser, en el export CSV y en formularios. Misma fragmentación que los estados.

### Código

5. **`editarPedidoAction()` no es atómico** — Borra todos los items con `adminClient` y luego los re-inserta. Si falla el insert después del delete, se pierden los productos del pedido. Debería estar en una transacción.

6. **Notificaciones sin UI de lectura** — La tabla `notificaciones` existe, el cron las crea, pero no hay ningún componente en la app que las marque como leídas.

7. **RLS en domicilios inconsistente** — La política de `DELETE` en domicilios excluye a `visor`, pero las de `INSERT` y `UPDATE` permiten a cualquier usuario autenticado. Un visor puede crear domicilios pero no eliminarlos.

### Riesgos de datos

8. **`numero_factura` en compras es UNIQUE pero nullable** — Permite múltiples compras sin número de factura (intencional) pero puede confundir al equipo si se espera unicidad total.

9. **`pedido_item_indice` en compra_items sin validación** — El campo existe para referenciar qué item del pedido se compró, pero no hay FK ni check que valide que el índice sea válido.

---

## 12. RIESGOS TÉCNICOS

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| Pérdida de items en edición de pedido | Baja | Alto | Envolver delete+insert en transacción |
| Desincronización de estados en código vs DB | Media | Medio | Crear single source of truth en DB (enum) |
| Schema de domicilios roto en nuevo deploy | Media | Alto | Consolidar migraciones en una sola |
| Agotamiento de créditos API Claude | Media | Bajo | Try/catch ya implementado, mensajes claros |
| Cron de alertas sin retry | Baja | Medio | Agregar idempotencia en procesar_alertas() |

---

## 13. RECOMENDACIONES GENERALES

1. **Consolidar estados de pedido** — Mover la definición a un enum PostgreSQL como source of truth. Los tipos TS se generarían desde ahí.

2. **Hacer `editarPedidoAction` atómico** — Usar una función PL/pgSQL similar a `crear_pedido()` para el UPDATE + DELETE + INSERT de items.

3. **Limpiar migraciones de domicilios** — Crear una migración de "consolidación" que garantice el estado final del schema.

4. **Agregar lectura de notificaciones en UI** — Un badge en el sidebar con el count de notificaciones no leídas + marcar como leídas al acceder a Alertas.

5. **Single API key para IA** — El sistema usa Anthropic para el asistente y lectura de facturas. OpenAI SDK ya puede eliminarse dado que parsear-factura.ts fue migrado a Claude.

---

## 14. PROPUESTA: MÓDULO DE FACTURACIÓN Y CUENTAS POR COBRAR

### Contexto del negocio

El flujo actual de Tres Bandas tiene:
- **Pedidos** que se crean y transicionan entre estados
- **Pagos** registrados contra cada pedido (abonos)
- **Cartera** como vista de saldo pendiente (lectura)

Lo que **no existe**: un sistema de facturación formal con documentos numerados, vencimientos, planes de pago, historial de cobranza y reportes.

### Flujo propuesto

```
Pedido (estado: entregado)
        ↓ [acción: generar factura]
Factura (numerada, con fecha de vencimiento)
        ↓ [cliente abona]
Pago de factura (abonos múltiples)
        ↓ [si supera vencimiento]
Alerta de cartera vencida
        ↓ [reporte]
Cuentas por cobrar (por cliente, por vencimiento, por asesor)
```

### Tablas nuevas a crear

#### `facturas`
```sql
id uuid PK DEFAULT uuid_generate_v4()
numero_factura text UNIQUE NOT NULL      -- Auto-generado: FAC-0001
pedido_id uuid REFERENCES pedidos(id)   -- Origen
cliente_id uuid REFERENCES clientes(id) NOT NULL
asesor_id uuid REFERENCES usuarios(id)  -- Quien facturó
sede_id uuid REFERENCES sedes(id)

-- Fechas
fecha_factura date NOT NULL DEFAULT current_date
fecha_vencimiento date NOT NULL          -- Calculada: +30/60/90 días según config

-- Montos
subtotal int NOT NULL                   -- Antes de descuento
descuento int NOT NULL DEFAULT 0
total int NOT NULL                      -- subtotal - descuento
total_pagado int NOT NULL DEFAULT 0     -- Sumatoria de pagos_factura

-- Estado
estado text NOT NULL DEFAULT 'emitida'
  CHECK (estado IN ('borrador','emitida','pagada','vencida','anulada'))

notas text
creado_en timestamptz NOT NULL DEFAULT now()
actualizado_en timestamptz NOT NULL DEFAULT now()
```

#### `factura_items`
```sql
id uuid PK
factura_id uuid REFERENCES facturas(id) ON DELETE CASCADE NOT NULL
descripcion text NOT NULL
cantidad int NOT NULL DEFAULT 1
valor_unitario int NOT NULL
descuento_item int NOT NULL DEFAULT 0
subtotal int NOT NULL                   -- (cantidad * valor_unitario) - descuento_item
-- Referencia opcional al pedido origen
pedido_item_id uuid REFERENCES pedido_items(id)
```

#### `pagos_factura`
```sql
id uuid PK
factura_id uuid REFERENCES facturas(id) ON DELETE CASCADE NOT NULL
monto int NOT NULL
metodo text NOT NULL                    -- Reutilizar MetodoPago
fecha date NOT NULL DEFAULT current_date
asesor_id uuid REFERENCES usuarios(id) NOT NULL
referencia text                         -- Número de transferencia, etc.
notas text
creado_en timestamptz NOT NULL DEFAULT now()
```

#### `planes_pago` (opcional — para crédito en cuotas)
```sql
id uuid PK
factura_id uuid REFERENCES facturas(id) ON DELETE CASCADE NOT NULL
numero_cuota smallint NOT NULL
fecha_vencimiento date NOT NULL
monto_cuota int NOT NULL
estado text NOT NULL DEFAULT 'pendiente'
  CHECK (estado IN ('pendiente','pagada','vencida'))
pagada_en timestamptz
```

### Vistas nuevas a crear

#### `vista_cuentas_por_cobrar`
```sql
-- Por cliente: todas las facturas con saldo pendiente
-- Campos: cliente, factura, fecha, vencimiento, total, pagado, saldo, dias_atraso
-- Ordenada por dias_atraso DESC
```

#### `vista_facturas_vencidas`
```sql
-- Facturas cuya fecha_vencimiento < hoy AND estado != 'pagada'
-- Usada por cron de alertas de cartera
```

### Server Actions nuevos

| Acción | Descripción |
|--------|-------------|
| `crearFacturaAction()` | Desde pedido entregado: genera numero_factura, copia items, calcula vencimiento |
| `crearFacturaManualAction()` | Sin pedido previo: items libres, cliente seleccionable |
| `editarFacturaAction()` | Solo en estado 'borrador': cambiar items, vencimiento, notas |
| `anularFacturaAction()` | Cambiar estado a 'anulada' (solo admin) |
| `registrarPagoFacturaAction()` | Insertar en pagos_factura + actualizar total_pagado + cambiar estado si saldo=0 |
| `crearPlanPagoAction()` | Generar cuotas automáticas (monto/nCuotas, fechas escalonadas) |
| `generarPDFFacturaAction()` | Generar HTML/PDF de factura para imprimir o descargar |

### Páginas nuevas

```
/facturacion                    — Listado con filtros (estado, cliente, fecha, sede)
/facturacion/nueva              — Crear factura manual o desde pedido
/facturacion/[id]               — Detalle: items, pagos, plan de cuotas, PDF
/facturacion/[id]/pago          — Registrar abono
/cuentas-por-cobrar             — Dashboard de cartera vencida y por vencer
/cuentas-por-cobrar/cliente/[id] — Historial de crédito de un cliente específico
```

### Integración con módulos existentes

1. **Pedidos** — En la página de detalle del pedido (estado: entregado), agregar botón "Generar Factura" que pre-llena los datos.

2. **Clientes** — En el perfil del cliente, agregar sección "Crédito activo" con saldo total y facturas pendientes.

3. **Cartera** — La vista actual de cartera (basada en pedidos) puede coexistir con la nueva vista de CxC (basada en facturas). A futuro se unificarían.

4. **Alertas / Cron** — Extender `procesar_alertas()` o crear un `procesar_alertas_cxc()` que detecte facturas vencidas y envíe recordatorios de pago.

5. **Dashboard admin** — Agregar KPI de "Cartera total vencida" y "Facturas por cobrar este mes".

6. **Asistente IA** — El chat ya puede responder sobre pedidos. Se puede extender para responder "¿qué clientes tienen facturas vencidas?" pasando el contexto de CxC.

### Generación de PDF

Opciones según stack actual:
- **HTML + `window.print()`** — Más simple, ya existe `/pedidos/[id]/imprimir` como patrón.
- **@react-pdf/renderer** — Genera PDFs desde componentes React (recomendado para PDF descargable).
- **Puppeteer (en Vercel)** — Más pesado, no recomendado en serverless.

**Recomendación:** Reutilizar el patrón de la página `/pedidos/[id]/imprimir` (HTML optimizado para print) + agregar un botón de descarga PDF con `@react-pdf/renderer`.

### Numeración de facturas

```
FAC-[SEDE]-[YYYY]-[NNNN]
Ejemplo: FAC-TR-2026-0001
```

Implementar con una función PL/pgSQL que obtenga el siguiente número de forma atómica (usando `SELECT ... FOR UPDATE` sobre una tabla de secuencias o `sequence` de PostgreSQL).

### Control de acceso (RLS)

| Rol | Puede crear | Puede ver | Puede editar | Puede anular |
|-----|-------------|-----------|--------------|--------------|
| admin | Sí (todas las sedes) | Sí (todas) | Sí (estado: borrador) | Sí |
| asesor | Sí (solo su sede) | Sí (solo su sede) | No | No |
| visor | No | Sí (solo su sede) | No | No |

### Orden de implementación sugerido

1. **Fase 1 — Schema** (1-2 sesiones)
   - Migración con tablas `facturas`, `factura_items`, `pagos_factura`
   - Vistas `vista_cuentas_por_cobrar` y `vista_facturas_vencidas`
   - Función de numeración automática

2. **Fase 2 — Backend** (1 sesión)
   - `crearFacturaAction()`, `registrarPagoFacturaAction()`, `anularFacturaAction()`
   - Tipos TypeScript correspondientes

3. **Fase 3 — UI básica** (1-2 sesiones)
   - `/facturacion` (listado)
   - `/facturacion/nueva` (crear desde pedido)
   - `/facturacion/[id]` (detalle + registrar pago)

4. **Fase 4 — CxC y reportes** (1 sesión)
   - `/cuentas-por-cobrar` (dashboard)
   - Integración en cliente y dashboard admin

5. **Fase 5 — PDF** (1 sesión)
   - Plantilla HTML de factura
   - Botón de impresión/descarga

6. **Fase 6 — Alertas automáticas** (1 sesión)
   - Cron de facturas vencidas
   - Emails de recordatorio de pago

---

## 15. RESUMEN EJECUTIVO

**El proyecto está en muy buen estado.** Los módulos core (pedidos, clientes, alertas, compras) están completos y bien estructurados. La arquitectura es sólida y consistente.

**Deuda técnica prioritaria:**
1. Hacer atómica la edición de pedidos (item delete+insert)
2. Limpiar schema de domicilios
3. Unificar source of truth de estados y métodos de pago

**Próxima gran funcionalidad:** El módulo de Facturación y Cuentas por Cobrar es la extensión natural del sistema. El 70% de la infraestructura necesaria ya existe (clientes, pedidos, pagos como patrón, alertas, RLS, cron). Solo se necesita construir la capa de facturación encima.

**Estimado de implementación completa del módulo CxC:** 6-8 sesiones de trabajo, implementando por fases para no interrumpir la operación actual.

---

*Documento generado por análisis estático del código. Para actualizar, ejecutar nueva auditoría.*
