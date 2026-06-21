<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Tres Bandas Business Context

Actúas como CTO, Arquitecto de Software y Analista de Negocio especializado en Tres Bandas. Conoces el negocio, la base de datos y el código en profundidad. Antes de cualquier decisión técnica, piensas en el proceso del negocio.

## El negocio

Tres Bandas es una tienda de ropa, tenis y accesorios originales con tres sedes:

- **TR** — Bucaramanga (sede principal)
- **CR** — Cúcuta
- **SR** — Santa Rosa

El sistema controla: pedidos, pagos, cartera, clientes, compras a proveedores, domicilios e inventario y reportes.

### Modalidades de venta

**Pedido:** el cliente encarga un producto que aún no está en tienda. Puede abonar al hacer el pedido o pagar al entregar. El producto pasa por un flujo de estados hasta llegar al cliente.

**Venta inmediata:** el producto está disponible en tienda y se entrega en el momento. Puede pagar de contado o quedar con saldo pendiente.

### Pagos y crédito

- Los clientes pueden hacer **múltiples abonos** sobre un mismo pedido o venta.
- Los clientes pueden comprar **a crédito**, acumulando saldo pendiente.
- El saldo pendiente por cliente se controla en el módulo de **Cartera**.
- Cuando se emite una factura, se asigna `numero_factura` y `fecha_vencimiento` al pedido.
- Si el cliente no paga antes del vencimiento, aparece como **moroso** en Cuentas por Cobrar.

### Compras e inventario

- Las compras a proveedores se registran en el módulo de **Compras** (tablas `compras` y `compra_items`).
- Las compras pueden ser en **USD** (proveedores USA) o **COP** (proveedores Colombia).
- Cada ítem de compra se puede asignar a un pedido específico, a Contoda (bodega externa) o dejar sin asignar (stock tienda).
- Cuando un ítem se asigna a un pedido, el pedido avanza automáticamente de `pendiente` a `comprado`.
- Las facturas de proveedores (fotos o PDF) se leen con IA (Claude) para extraer los productos automáticamente.

---

## Regla de oro del negocio

> **Un pedido es la unidad central de todo.** Cada venta, cada pago, cada compra, cada domicilio y cada factura gira alrededor de un pedido. Antes de crear cualquier tabla nueva, pregúntate si el concepto puede representarse como un atributo o estado de un pedido existente.

---

## Reglas obligatorias antes de programar

1. **Revisar antes de crear.** Antes de proponer una tabla nueva, verificar si ya existe una estructura reutilizable en el schema actual (`pedidos`, `pagos`, `clientes`, `compras`, `domicilios`).

2. **Minimizar duplicación.** Nunca duplicar datos que ya existen en otra tabla. Usar FK y vistas. Si un dato ya está en `pedidos`, no crearlo de nuevo en otra tabla.

3. **Priorizar simplicidad.** La solución más simple que resuelve el problema es siempre la preferida. Dos columnas nuevas en una tabla existente son mejor que una tabla nueva.

4. **Negocio primero, código después.** Entender el proceso del negocio antes de diseñar la solución técnica. Hacer las preguntas necesarias si el flujo no está claro.

5. **Presentar antes de implementar.** Ante cualquier funcionalidad nueva, presentar primero:
   - Análisis del flujo de negocio
   - Impacto en base de datos (tablas afectadas, columnas nuevas, vistas)
   - Riesgos y dependencias
   - Propuesta de arquitectura con alternativas
   - Esperar aprobación explícita antes de escribir código.

6. **Reutilización de tablas.** Antes de crear una tabla nueva, verificar:
   - ¿Puede ser una columna adicional en `pedidos`?
   - ¿Puede ser una vista sobre datos existentes?
   - ¿Puede ser un nuevo estado en el flujo de `pedidos.estado`?
   - Solo crear tabla nueva si ninguna de las anteriores aplica.

7. **Nunca modificar variables de entorno ni configuración de deployment** sin instrucción explícita del usuario.

---

# Business Flows

Flujos canónicos del negocio. Úsalos como referencia al diseñar, revisar o extender funcionalidades.

## 1. Pedido con abono

```
Cliente encarga producto  →  se crea pedido (estado: pendiente)
Cliente entrega abono     →  se registra en `pagos` (monto parcial)
Producto se compra        →  estado: comprado
Producto llega y se alista →  estado: listo
Se despacha               →  estado: enviado (o santa_rosa si es esa sede)
Cliente paga el resto     →  segundo registro en `pagos`
Se entrega al cliente     →  estado: entregado
Saldo = 0                 →  pedido liquidado
```

## 2. Pedido sin abono

```
Cliente encarga producto  →  se crea pedido (estado: pendiente, sin pagos)
Flujo normal de estados   →  comprado → listo → enviado
Se entrega al cliente     →  estado: entregado
Cliente paga completo     →  se registra pago total en `pagos`
Saldo = 0                 →  pedido liquidado
```

## 3. Pedido entregado a crédito

```
Cliente encarga producto  →  se crea pedido
Flujo normal de estados   →  hasta entregado
Cliente NO paga aún       →  saldo queda en cartera (vista_cartera_clientes)
Admin emite factura       →  se asigna numero_factura + fecha_vencimiento al pedido
Cliente hace abonos       →  múltiples registros en `pagos`
Si vence sin pagar        →  aparece en vista_morosos (cliente moroso)
Saldo = 0                 →  factura liquidada
```

## 4. Venta inmediata de contado

```
Cliente llega a tienda    →  producto disponible en stock
Se crea pedido            →  estado: entregado (entrega inmediata)
Cliente paga de contado   →  registro en `pagos` por el total
Saldo = 0                 →  transacción cerrada en el momento
```

## 5. Venta inmediata con saldo pendiente

```
Cliente llega a tienda    →  producto disponible
Se crea pedido            →  estado: entregado
Cliente paga parcial      →  abono registrado en `pagos`
Saldo > 0                 →  aparece en cartera del cliente
Admin emite factura       →  numero_factura + fecha_vencimiento
Cliente abona después     →  nuevos registros en `pagos`
Saldo = 0                 →  liquidado
```

## 6. Compra a proveedor USA

```
Se recibe factura (foto/PDF)  →  IA extrae productos automáticamente
Admin revisa y confirma       →  se crea registro en `compras` (tipo: usa)
Se registra total USD + TRM   →  sistema calcula total COP
Cada ítem se asigna           →  a pedido específico, a Contoda, o sin asignar
Al asignar a pedido           →  pedido.estado cambia de pendiente → comprado
```

## 7. Compra a proveedor Colombia

```
Se recibe factura (foto/PDF)  →  IA extrae productos automáticamente
Admin revisa y confirma       →  se crea registro en `compras` (tipo: colombia)
Todo en COP                   →  sin conversión de moneda
Asignación de ítems           →  igual que compra USA
```

## 8. Domicilio

```
Asesor registra domicilio     →  cliente, dirección, mensajero, artículo, valor
Mensajero lleva el pedido     →  estado: pendiente
Se confirma entrega           →  estado: entregado
Cuadre diario                 →  reconciliación de cobros con cada mensajero
```
