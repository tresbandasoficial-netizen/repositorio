# PROJECT_STATUS.md — Tres Bandas App
> Última actualización: 2026-06-21

---

## 1. ARQUITECTURA GENERAL

**ERP interno** para una cadena de ropa y calzado (Tres Bandas, Bucaramanga, Colombia) con 3 sedes:

| Código | Ciudad | Rol |
|--------|--------|-----|
| **TR** | Bucaramanga | Sede principal / bodega |
| **CR** | Cúcuta | Sede regional |
| **SR** | Santa Rosa | Sede regional |

**Patrón arquitectónico:** Next.js App Router con Server Components + Server Actions. No hay API REST pública; toda la lógica de negocio vive en Server Actions (`'use server'`). Base de datos en Supabase (PostgreSQL con RLS).

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
│   │   ├── facturacion/        # ✅ NUEVO — Facturas y pagos
│   │   ├── inventario/         # ✅ NUEVO — Catálogo + stock
│   │   ├── pedidos/
│   │   ├── perfil/
│   │   └── usuarios/           # Admin-only
│   ├── actions/                # Server Actions (toda la lógica de negocio)
│   │   ├── articulos.ts        # ✅ NUEVO — Catálogo, buscar, entrada, transferencia
│   │   ├── asistente.ts
│   │   ├── clientes.ts
│   │   ├── compras.ts
│   │   ├── domicilios.ts
│   │   ├── parsear-factura.ts
│   │   ├── pedidos.ts
│   │   ├── ventas.ts           # ✅ NUEVO — Venta inmediata
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
│   │   └── DomicilioDesdeFacturaPanel.tsx  # ✅ NUEVO
│   ├── facturacion/            # ✅ NUEVO
│   ├── inventario/             # ✅ NUEVO — InventarioPanel.tsx
│   ├── layout/                 # Sidebar, MobileNav
│   ├── pedidos/
│   ├── ventas/                 # ✅ NUEVO — LineaProducto.tsx
│   └── ui/                     # Button, Card, Badge, etc.
├── lib/
│   ├── auth/                   # getSesion(), puedeAccederSede()
│   ├── domain/                 # estados.ts (transiciones de estado)
│   ├── email/                  # Templates Resend
│   ├── parser/                 # Parser de texto libre → ParsedPedido
│   ├── queries/                # Data fetching (read-only)
│   │   └── inventario.ts       # ✅ NUEVO — getStockPorSede, getStockArticuloSede
│   ├── supabase/               # client.ts, server.ts, admin.ts
│   └── utils/                  # phone.ts, format.ts, cn.ts
├── types/
│   └── index.ts                # Todos los tipos TypeScript
└── supabase/
    └── migrations/             # 31 migraciones SQL (ver detalle abajo)
```

---

## 4. BASE DE DATOS — TABLAS PRINCIPALES

### Tablas del negocio

| Tabla | Descripción |
|-------|-------------|
| `sedes` | TR, CR, SR — 3 registros fijos |
| `usuarios` | Empleados con rol (admin/asesor/visor) y sede |
| `clientes` | Base de clientes únicos, identificados por teléfono |
| `pedidos` | **Tabla central.** Todo gira alrededor del pedido |
| `pedido_items` | Líneas de producto por pedido |
| `pagos` | Abonos registrados contra cada pedido |
| `alertas` | Pedidos con tiempo excedido o zombies |
| `notificaciones` | Notificaciones por usuario (badge pendiente) |
| `historial_cambios` | Auditoría completa de todos los cambios |
| `compras` | Facturas de proveedores (USA/Colombia) |
| `compra_items` | Productos de cada compra, con destino (pedido/bodega) |
| `domicilios` | Envíos diarios a clientes |
| `facturas` | ✅ Facturas emitidas a clientes (numeradas) |
| `factura_items` | ✅ No existe aún — facturas usan pedidos directamente |
| `pagos_factura` | ✅ Abonos a facturas (separado de pagos de pedidos) |

### Catálogo e inventario (Migración 031 — Junio 2026)

| Tabla | Descripción |
|-------|-------------|
| `articulos` | **Catálogo de modelos.** Código SKU, marca, nombre, referencia, color, sexo, fotos[], descripcion. **Sin talla** — la talla vive en el inventario |
| `movimientos_inventario` | Libro mayor del inventario. `delta` = cantidad (+ entrada, - salida). Incluye campo `talla` para identificar la talla específica |

**Principio clave:** Un código de producto (ej. "VOMERO5-WB") representa un modelo único (Nike Vomero 5 White/Black) sin importar la talla. El stock se lleva por `(articulo_id, talla, sede_id)`.

---

## 5. SCHEMA DETALLADO

### `articulos` (catálogo — post migración 031)
```sql
id          uuid PK
codigo      text UNIQUE (sparse, solo si se especifica) -- ej. "VOMERO5-WB"
nombre      text NOT NULL
marca       text NOT NULL
referencia  text                                        -- referencia del proveedor
color       text
sexo        text CHECK IN ('hombre','mujer','unisex','nino','nina')
categoria   text                                        -- enum CategoriaArticulo
fotos       text[] NOT NULL DEFAULT '{}'
descripcion text
talla       text  -- OBSOLETO: solo en registros anteriores a migración 031
activo      bool
creado_en   timestamptz
-- Índice único: (lower(marca), lower(nombre), lower(color), lower(sexo))
-- Índice trigram: codigo (para autocompletar)
```

### `movimientos_inventario` (post migración 031)
```sql
id                uuid PK
articulo_id       uuid FK articulos
talla             text   -- ej. '42', 'M', 'XL' — NULL para registros anteriores
sede_id           uuid FK sedes
delta             integer   -- positivo = entrada, negativo = salida
tipo              text      -- 'entrada'|'salida'|'transferencia'|'asignacion'
costo_unitario_cop integer
compra_item_id    uuid FK compra_items (opcional)
pedido_id         uuid FK pedidos (opcional, para salidas por venta)
transferencia_id  uuid  -- agrupa los dos movimientos de una transferencia
usuario_id        uuid FK usuarios
notas             text
creado_en         timestamptz
```

### `pedidos`
```sql
id                uuid PK
numero_orden      text UNIQUE         -- ej. 'TR5946'
sede_id           uuid FK sedes
cliente_id        uuid FK clientes
asesor_id         uuid FK usuarios
estado            text  -- ver flujos de estados
tipo              text  -- 'pedido'|'venta_inmediata'
total             int
tipo_entrega      text  -- 'sede'|'domicilio'
direccion_entrega text
notas             text
numero_guia       text
factura_id        uuid FK facturas    -- si fue facturado
fecha_creacion    timestamptz
fecha_actualizacion timestamptz       -- auto-actualizada por trigger
```

### `pedido_items`
```sql
id           uuid PK
pedido_id    uuid FK pedidos CASCADE
articulo_id  uuid FK articulos (opcional)  -- vinculado al catálogo si se seleccionó
marca        text
descripcion  text
talla        text
cantidad     int
precio_venta int
imagen_url   text
```

### `facturas` (implementado)
```sql
id               uuid PK
numero_factura   text UNIQUE  -- formato: FAC-TR-2026-0001
sede_id          uuid FK sedes
cliente_id       uuid FK clientes
fecha_factura    date
fecha_vencimiento date
estado           text CHECK IN ('pendiente','pagada','vencida','anulada')
notas            text
creado_en        timestamptz
-- Relación: pedidos.factura_id apunta a esta tabla
-- Pagos: tabla pagos_factura separada de pagos de pedidos
```

---

## 6. VISTAS DE BASE DE DATOS

| Vista | Descripción |
|-------|-------------|
| `vista_pedidos_asesor` | Pedidos con cliente, asesor, sede, total_pagado, en_alerta, es_zombie |
| `vista_zombies` | Pedidos con es_zombie = true |
| `vista_cartera_clientes` | Clientes con saldo pendiente > 0 (basado en pedidos) |
| `vista_stock_por_sede` | Stock por `(articulo_id, talla, sede_id)` — agrupa movimientos_inventario |
| `vista_costo_promedio` | CPP por `(articulo_id, talla)` — promedio ponderado de entradas |
| `vista_utilidad_pedidos` | Ingreso, costo (CPP) y utilidad por pedido |
| `vista_utilidad_facturas` | Utilidad agregada por factura |

**Nota de compatibilidad:** `vista_stock_por_sede` usa `coalesce(m.talla, a.talla)` para que registros anteriores a la migración 031 (donde la talla estaba en `articulos.talla`) sigan funcionando correctamente.

---

## 7. FUNCIONES PL/pgSQL

| Función | Descripción |
|---------|-------------|
| `crear_pedido()` | Transaccional: pedido + items + pago inicial + historial |
| `cambiar_estado_pedido()` | Cambia estado + registra en historial_cambios |
| `procesar_alertas()` | Materializa alertas + crea notificaciones + data para emails |
| `registrar_entrada_inventario(p_articulo_id, p_talla, ...)` | ✅ Entrada al inventario por talla y sede |
| `transferir_stock(p_articulo_id, p_talla, p_sede_origen, p_sede_destino, ...)` | ✅ Transferencia entre sedes por talla |
| `registrar_venta_inmediata(...)` | ✅ Crea pedido de tipo venta_inmediata + descuenta stock |
| `auth_es_admin()` | Helper RLS — verifica si el usuario activo es admin |
| `auth_sede_id()` | Helper RLS — retorna sede_id del usuario activo |

---

## 8. MIGRACIONES SQL (historial)

| # | Descripción |
|---|-------------|
| 001-010 | Schema inicial: sedes, usuarios, clientes, pedidos, pagos, alertas |
| 011-015 | Mejoras: historial_cambios, notificaciones, parser, RLS |
| 016-020 | Domicilios, compras, compra_items, parser IA facturas |
| 021-025 | Alertas cron, umbrales, vista_zombies, exportación |
| 026-027 | Estadísticas, vista_utilidad, dashboard admin |
| 028 | Facturación: tablas facturas + pagos_factura |
| 029 | Venta inmediata (registrar_venta_inmediata, pedidos.tipo) |
| 030 | Inventario inicial: articulos + movimientos_inventario |
| **031** | **✅ Reestructura catálogo:** codigo/referencia/color/sexo en articulos; talla pasa a movimientos_inventario; vistas y funciones actualizadas |

---

## 9. SERVER ACTIONS (Backend)

### Pedidos
| Acción | Descripción |
|--------|-------------|
| `crearPedidoAction()` | Parse texto libre → crear pedido completo |
| `crearPedidoDesdeDataAction()` | Crear desde datos ya estructurados |
| `cambiarEstadoAction()` | Validar transición + RPC (con redirect) |
| `cambiarEstadoInlineAction()` | Igual pero sin redirect |
| `registrarPagoAction()` | Validar saldo + insertar pago |
| `editarPedidoAction()` | Actualizar pedido + items (delete+insert) |
| `eliminarPedidoAction()` | Solo admin |

### Artículos e Inventario (✅ NUEVO)
| Acción | Descripción |
|--------|-------------|
| `crearArticuloAction(data)` | Crear nuevo artículo en el catálogo |
| `buscarPorCodigoAction(codigo)` | Buscar artículo por código SKU |
| `registrarEntradaAction(data)` | Registrar entrada de stock (articulo_id + talla + sede) |
| `transferirStockAction(data)` | Transferencia entre sedes (por articulo + talla) |
| `buscarArticulosAction(q, sedeId)` | Búsqueda con stock por sede; devuelve `tallaStock[]` |

### Ventas (✅ NUEVO)
| Acción | Descripción |
|--------|-------------|
| `registrarVentaInmediataAction()` | Venta en tienda: crea pedido entregado + descuenta stock |

### Clientes
| Acción | Descripción |
|--------|-------------|
| `buscarClientesAction()` | Búsqueda ilike + última dirección de domicilio |
| `buscarDireccionPorTelefonoAction()` | Lookup dirección por teléfono |
| `editarClienteAction()` | Actualizar datos de cliente |

### Compras
| Acción | Descripción |
|--------|-------------|
| `crearCompraAction()` | Crear compra + items |
| `asignarItemAction()` | Vincular item a pedido (actualiza estado si pendiente) |
| `eliminarCompraAction()` | Solo admin |
| `parsearFacturaAction()` | IA (Claude) → extrae JSON de foto/PDF de factura |

### Domicilios
| Acción | Descripción |
|--------|-------------|
| `crearDomicilioAction()` | Insertar registro de domicilio |
| `editarDomicilioAction()` | Actualizar domicilio |

### Facturación
| Acción | Descripción |
|--------|-------------|
| `crearFacturaAction()` | Agrupar pedidos en una factura numerada |
| `registrarPagoFacturaAction()` | Abono a factura |
| `anularFacturaAction()` | Solo admin |

### Usuarios y Asistente IA
| Acción | Descripción |
|--------|-------------|
| `invitarUsuarioAction()` | Crear usuario + email de invitación |
| `toggleActivoAction()` | Activar/desactivar usuario |
| `resumenAsistenteAction()` | IA: resumen ejecutivo de pendientes |
| `alertasAsistenteAction()` | IA: lista de casos urgentes |
| `chatAsistenteAction()` | IA: chat con tool-use (cambiar estado, pago, nota) |

---

## 10. COMPONENTES CLAVE

### Formularios de venta/pedido
| Componente | Descripción |
|-----------|-------------|
| `CrearPedidoForm.tsx` | Crear pedido desde texto libre o búsqueda en catálogo. Campo "Código SKU" auto-completa marca/nombre/color desde el catálogo |
| `EditarPedidoForm.tsx` | Editar pedido existente con misma estructura |
| `LineaProducto.tsx` | Fila de producto con búsqueda en catálogo por nombre/marca. Muestra stock por sede. Expande por talla (un resultado por talla disponible) |

### Inventario
| Componente | Descripción |
|-----------|-------------|
| `InventarioPanel.tsx` | Panel completo: crear artículo, registrar entrada, transferir stock, ver tabla de stock por (talla, sede) |

### Facturación y domicilios
| Componente | Descripción |
|-----------|-------------|
| `RegistrarPagoFacturaForm.tsx` | Form para registrar abono a una factura |
| `AnularFacturaButton.tsx` | Botón de anulación (solo admin) |
| `DomicilioDesdeFacturaPanel.tsx` | ✅ NUEVO — Botón "🛵 Crear domicilio" dentro del detalle de factura. Pre-llena datos del cliente y auto-completa dirección por teléfono |

---

## 11. MÓDULOS — ESTADO DE COMPLETITUD

| Módulo | Estado | Completitud | Notas |
|--------|--------|-------------|-------|
| Pedidos | ✅ Completo | 100% | Núcleo del negocio; crea/edita/cambia estado/paga |
| Clientes | ✅ Completo | 100% | Búsqueda, historial, edición |
| Dashboard | ✅ Completo | 100% | KPIs diferenciados por rol |
| Alertas | ✅ Completo | 100% | Cron automático + emails |
| Estadísticas | ✅ Completo | 100% | Gráficas, períodos, desglose por asesor/sede |
| Cartera | ✅ Completo | 100% | Vista de saldo por cliente (lectura) |
| Compras | ✅ Completo | 100% | Parser IA de facturas, asignación a pedidos |
| Usuarios | ✅ Completo | 100% | Invitación, roles, sedes, activar/desactivar |
| Domicilios | ✅ Completo | 95% | CRUD completo + botón desde facturación |
| Perfil | ⚠️ Básico | 50% | Solo ver datos y cambiar contraseña |
| Asistente IA | ✅ Completo | 100% | Resumen, alertas, chat con tool-use |
| **Facturación** | ✅ Completo | 90% | Listado, detalle, abonos, anular, imagen para cliente |
| **Inventario / Catálogo** | ✅ Completo | 90% | Catálogo separado de inventario; stock por talla y sede |
| Venta Inmediata | ✅ Completo | 95% | Flujo completo con descuento de inventario por talla |

---

## 12. FLUJOS DE NEGOCIO IMPLEMENTADOS

### Estados de pedido y sus transiciones
```
pendiente
  → comprado        (al asignar compra_item al pedido)
  → listo           (el producto llegó y está listo para entrega)
  → enviado         (enviado por domiciliario — sedes CR/SR)
  → santa_rosa      (en tránsito a Santa Rosa)
  → entregado       (cliente recibió el producto)
  → cancelado       (pedido cancelado — requiere admin)
```

### Modalidades de venta
1. **Pedido:** Cliente encarga, paga abonos, producto llega, se entrega
2. **Venta inmediata:** Producto en stock → pedido `tipo=venta_inmediata`, estado=`entregado`, se descuenta inventario por talla

### Compras a proveedores
- **USA:** Factura en USD + TRM → calcula total COP; parser IA extrae productos
- **Colombia:** Directamente en COP; parser IA extrae productos
- Cada ítem → asignar a pedido (pedido pasa a `comprado`) o a bodega TR

### Inventario
- Stock = suma de `delta` en `movimientos_inventario` por (articulo_id, talla, sede_id)
- CPP = promedio ponderado de costos en entradas por (articulo_id, talla)
- Transferencias entre sedes: doble movimiento (-origen, +destino) con mismo `transferencia_id`

---

## 13. REGLAS DE NEGOCIO IMPLEMENTADAS EN CÓDIGO

1. **Código SKU = modelo, no talla** — El mismo código aplica para todas las tallas del producto. La talla vive en el inventario, no en el catálogo.

2. **Stock puede ser negativo** — El sistema permite ventas sin stock (advertencia visual pero no bloqueo). El inventario se debe reponer después.

3. **Compra sin pedido_id → bodega TR** — Si un compra_item no tiene destino asignado, el stock va a la sede TR (Bucaramanga) por defecto.

4. **CPP por (articulo, talla)** — El costo promedio ponderado se calcula independientemente por cada combinación de artículo + talla.

5. **Factura agrupa pedidos** — Una factura puede contener uno o varios pedidos del mismo cliente. Numeración: FAC-[SEDE]-[YYYY]-[NNNN].

6. **Mensajes WhatsApp sin datos internos** — Los campos código, referencia, sexo, CPP e inventario son internos y NO se incluyen en mensajes para clientes.

7. **Asesor ve solo su sede, admin ve todo** — Control de acceso por RLS en PostgreSQL + helpers `auth_es_admin()` y `auth_sede_id()`.

---

## 14. DEUDA TÉCNICA CONOCIDA

| Problema | Impacto | Prioridad |
|----------|---------|-----------|
| `editarPedidoAction` no es atómico (delete+insert separados) | Si falla el insert, el pedido pierde sus items | Alta |
| Notificaciones sin UI de lectura | Badge de notificaciones no implementado en sidebar | Media |
| Umbrales de alerta duplicados (tipos TS vs SQL) | Desincronización silenciosa si se cambia uno | Media |
| Schema de domicilios inconsistente entre migraciones | Riesgo en nuevos deploys | Media |
| `pedido_item_indice` en compra_items sin FK ni validación | Índice puede quedar inválido | Baja |

---

## 15. CONFIGURACIÓN Y DEPLOYMENT

- **Plataforma:** Vercel (Next.js optimizado)
- **Cron:** `/api/cron/alertas` — se ejecuta diariamente vía Vercel Cron
- **Variables de entorno requeridas:**
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `ANTHROPIC_API_KEY`
  - `RESEND_API_KEY`
  - `CRON_SECRET`
- **Ramas Git:**
  - `claude/beautiful-thompson-CrYqb` — producción
  - `claude/nifty-volta-WTurm` — desarrollo activo

---

## 16. RESUMEN EJECUTIVO

El sistema está **funcionalmente completo** para las operaciones diarias de Tres Bandas. Los módulos core (pedidos, clientes, compras, alertas, facturación, inventario) están implementados y en producción.

**Cambio más reciente (Junio 2026 — Migración 031):**
- Catálogo separado del inventario: artículos describen el modelo, el inventario registra el stock por talla y sede
- Código SKU como identificador único de modelo
- CPP y stock calculados por (articulo, talla)
- Botón "Crear domicilio" integrado en el detalle de factura

**Próximas mejoras sugeridas:**
1. Hacer atómica la edición de pedidos
2. Badge de notificaciones en el sidebar
3. Conectar formulario de compras con el catálogo de artículos (selección desde catálogo en lugar de texto libre)
4. Carga inicial de inventario histórico

---

*Documento de estado del proyecto. Actualizado manualmente al finalizar cada sesión de desarrollo.*
