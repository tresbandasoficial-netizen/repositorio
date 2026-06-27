# Informe de Auditoría — Sistema Tres Bandas

**Fecha:** 2026-06-27
**Alcance:** Aplicación Next.js 16 + Supabase/PostgreSQL (pedidos, facturación, cartera, compras, gastos, flujo de caja, mensajerías).
**Metodología:** Revisión de código del repositorio, revisión de las 82 migraciones SQL, y verificación directa contra la base de datos de **producción** (vía API REST con service role). Cada hallazgo indica si fue **verificado**, **corregido** o **pendiente**.

---

## 1. Resumen ejecutivo

El sistema tiene un diseño sólido: lógica financiera transaccional (RPCs con `FOR UPDATE`), anulación con rastro de auditoría (no se borra), y separación de dinero por sede. Durante la sesión se **corrigieron 7 problemas** (incluido un trigger roto que bloqueaba las compras y un abono de $1.3M mal contabilizado).

Quedan pendientes principalmente temas de **seguridad de rutas API**, **rendimiento (índices)** y **deuda técnica (lint, deriva de esquema)**.

| Severidad | Corregidos | Pendientes |
|---|---|---|
| 🔴 Crítico | 2 | 0 |
| 🟠 Alto | 4 | 0 |
| 🟡 Medio | 3 | 1 (índices — migración lista) |
| 🔵 Bajo | 1 | 2 (informativos) |

> **Actualización (misma fecha):** se corrigieron en código A-03, A-04 y M-03. M-04 resultó **falso positivo**. Para M-05 (índices) quedó lista la migración `083_indices_fk.sql`. Solo resta correr 2 migraciones SQL en Supabase y el diff de esquema (M-06).

---

## 2. Hallazgos corregidos en esta sesión ✅

### C-01 · 🔴 Trigger roto bloqueaba TODAS las compras — CORREGIDO
- **Qué:** Existía en producción el trigger `trg_compra_crea_gasto` (función `crear_gasto_compra`) que referenciaba `NEW.total`, columna que no existe en `compras` (es `total_cop`).
- **Riesgo:** Imposible registrar cualquier compra (error `record "new" has no field "total"`).
- **Causa raíz:** Objeto creado **directo en la BD, fuera de las migraciones** (trabajo paralelo).
- **Acción:** `DROP TRIGGER trg_compra_crea_gasto` + `DROP FUNCTION crear_gasto_compra`. La app ya crea el egreso de compra por código.

### C-02 · 🔴 Flujo de caja contaba pagos anulados — CORREGIDO
- **Qué:** `app/(dashboard)/flujo-caja/page.tsx` sumaba `pagos` y `pagos_factura` sin filtrar `anulado=false`.
- **Riesgo:** Saldos de cuentas inflados con dinero de pedidos cancelados / facturas anuladas.
- **Acción:** Se agregó `.eq('anulado', false)` a ambas consultas.

### A-01 · 🟠 El efectivo era lo único conectado a cuentas — CORREGIDO
- **Qué:** Al registrar abonos, solo el efectivo se enrutaba a una cuenta; Bancolombia/Nequi/Addi/etc. quedaban con `cuenta_id = null` y no sumaban a ninguna cuenta.
- **Riesgo:** El flujo de caja no reflejaba el dinero que entraba por transferencia/tarjeta.
- **Acción:** Se generalizó `efectivoCuentaId` → `cuentaIdPorMetodo` (mapea cada método a su cuenta vía `cuentas.metodo_pago`) en los 6 puntos de registro de pago. Verificado contra datos reales.

### A-02 · 🟠 Abono vivo en factura anulada ($1.300.000) — CORREGIDO
- **Qué:** El abono `6f952d12` (Bancolombia, $1.300.000, 21-jun) seguía con `anulado=false` aunque su factura **FAC-TR-2026-0002 está anulada**.
- **Riesgo:** Dinero fantasma contabilizable.
- **Acción:** Marcado `anulado=true`. Re-verificado: **0 abonos vivos en facturas anuladas**.

### M-01 · 🟡 Compras no descontaban ninguna cuenta — CORREGIDO
- **Qué:** No había forma de indicar de qué cuenta salía el dinero de una compra; tampoco generaba egreso.
- **Acción:** Selector de cuenta de pago en el formulario + creación automática de gasto (egreso) ligado a la cuenta. Para cuentas globales (sin sede) el egreso se atribuye a Bucaramanga.

### M-02 · 🟡 Ventas locales mostraban "pendiente" estando pagadas — CORREGIDO
- **Qué:** El detalle del pedido calculaba saldo solo desde `pagos`; en ventas locales (VL) el pago vive en `pagos_factura`, así que mostraba "Saldo pendiente" aunque la factura estuviera pagada.
- **Acción:** `getPedidoDetalle` ahora suma también los abonos de la factura vinculada.

### B-01 · 🔵 Consecutivo de pedidos por sede causaba duplicados — CORREGIDO
- **Qué:** La sugerencia de número era independiente por sede → quedaban `TR0001` y `SR0001` a la vez.
- **Acción:** Consecutivo **compartido** entre sedes (máximo global reciente + 1).

---

## 3. Hallazgos pendientes ⚠️

### A-03 · 🟠 Ruta `/api/setup-admin` exponía credenciales — ✅ CORREGIDO
- **Qué:** `app/api/setup-admin/route.ts` tenía token, email y contraseña del admin **hardcodeados** y devolvía la contraseña en texto plano.
- **Riesgo:** Cualquiera con el token (visible en el repo/git) podía resetear la contraseña del administrador.
- **Acción:** Archivo **eliminado** (ya cumplió su propósito; el admin existe). También se eliminó `/api/admin/migrate` (sin autenticación, residual).

### A-04 · 🟠 Validación de sede al crear pedidos — ✅ CORREGIDO
- **Qué:** El flujo de crear pedido (encargo) no verificaba que el asesor perteneciera a la sede del pedido.
- **Acción:** Se agregó `puedeAccederSede` en `_crearPedidoConDatos`. (Venta inmediata y facturación ya validaban la sede.)

### M-03 · 🟡 Crons sin protección si falta `CRON_SECRET` — ✅ CORREGIDO
- **Qué:** `/api/cron/cierre-automatico` y `/api/cron/alertas` solo validaban el secreto **si la variable existía**; si no, la ruta quedaba abierta.
- **Acción:** Ahora rechazan con **503** si `CRON_SECRET` no está configurado.

### M-04 · 🟡 `/api/export/cuadre` y la sede — ❎ FALSO POSITIVO
- **Análisis:** Se verificó que `getCuadre` **ya fuerza** la sede del usuario para no-admin (`sedeFiltroCodigo = esAdmin ? filtros.sede : sedeForzadaCodigo`). El parámetro `?sede=` se ignora para asesores. **No es explotable.**

### M-05 · 🟡 Faltan índices en llaves foráneas — 🟢 MIGRACIÓN LISTA
- **Qué:** Sin índice en columnas muy usadas en sumas: `pagos.cuenta_id`, `pagos_factura.cuenta_id`, `pagos_factura.asesor_id`, `gastos.cuenta_id`, `traslados_caja.origen/destino_cuenta_id`, `pagos_mensajeria.factura_id`.
- **Riesgo:** Consultas lentas de caja/cartera a medida que crecen los datos.
- **Acción:** Migración **`083_indices_fk.sql`** creada (con `CREATE INDEX IF NOT EXISTS`). **Falta correrla en Supabase → SQL Editor.**

### M-06 · 🟡 Deriva de esquema (BD vs migraciones) — PARCIAL
- **Qué:** Apareció un trigger (C-01) que no estaba en las migraciones. Esto indica que **producción puede tener objetos no reflejados en el repo**.
- **Estado:** Se eliminó el trigger conocido. Falta el diff completo de triggers/funciones (requiere consulta SQL en el editor de Supabase).
- **Solución:** Comparar `pg_trigger`/`pg_proc` contra las migraciones y documentar/migrar lo que falte. **El repo debe ser la fuente de verdad.**

### B-02 · 🔵 145 errores de lint (mayormente `any`) — PENDIENTE
- **Qué:** `npx eslint .` reporta 145 errores (no bloquean el build en Next 16, pero son deuda técnica).
- **Solución:** Limpieza gradual de tipos `any`.

### B-03 · 🔵 Números de pedido duplicados históricos — INFORMATIVO
- **Qué:** 21 números compartidos entre TR y SR (rango 5747–6483), creados **antes** del arreglo del consecutivo.
- **Estado:** Se decidió **dejarlos** (son pedidos pasados; no rompen nada porque el sistema usa IDs internos). El arreglo nuevo evita futuros duplicados.

### B-04 · 🔵 Facturas de prueba con estado inconsistente — INFORMATIVO
- **Qué:** FAC-0012/0013 (total $1, sobrepagadas $6) y FAC-0043 (total $0) figuran "pendiente" con saldo ≤ 0.
- **Estado:** Datos de prueba/borde, montos triviales, anteriores al corte. No afectan dinero real.

---

## 4. Verificado y correcto ✅

- **Vistas:** las 8 vistas financieras existen y responden (`vista_pedidos_asesor`, `vista_facturas`, `vista_morosos`, `vista_cartera_clientes`, `vista_pagos_unificados`, `flujo_caja_diario`, `saldos_cuentas`, `ventas_diarias_sede`).
- **Integridad referencial:** sin referencias rotas en `pagos.cuenta_id`, `pagos_factura.cuenta_id`, `gastos.cuenta_id` ni `pedidos.factura_id`.
- **Pagos anulados:** 0 pagos vivos en pedidos cancelados; 0 abonos vivos en facturas anuladas (tras la corrección A-02).
- **Enrutamiento de pagos:** todos los pagos desde el corte (2026-06-26) están enlazados a la cuenta correcta de su método.
- **Separación de efectivo por sede:** el efectivo de Santa Rosa va a su caja; las sedes no se mezclan.
- **Funciones transaccionales:** `crear_pedido`, `registrar_pago_pedido`, `cambiar_estado_pedido`, `crear_factura`, `anular_factura`, `abonar_cliente` — manejo de excepciones (rollback) y bloqueos correctos.
- **Timezone Bogotá** consistente vía `hoy_bogota()`.

---

## 5. Recomendaciones priorizadas

1. **(Alto)** Eliminar/proteger `/api/setup-admin` — riesgo de seguridad concreto.
2. **(Alto)** Validar sede del asesor en `crear_pedido`.
3. **(Medio)** Proteger crons cuando falte `CRON_SECRET`; validar sede en export de cuadre.
4. **(Medio)** Migración de índices FK (rendimiento).
5. **(Medio)** Diff completo de esquema BD↔migraciones; dejar el repo como fuente de verdad.
6. **(Bajo)** Limpieza de lint; configurar auto-deploy de `main` a Producción en Vercel.

---

*Informe generado a partir de verificación directa contra el código y la base de datos de producción. Los puntos marcados "reportado" provienen de revisión de código y conviene confirmarlos antes de remediar.*
