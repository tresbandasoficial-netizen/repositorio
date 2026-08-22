# Brief de implementación — Módulo de Flujo de Caja

Documento para pegarle a Claude Code. Stack objetivo: **Next.js + Supabase (Postgres)**.

---

## Paso 0 — Instalar el subagente

Copia el archivo `flujo-de-caja.md` a la carpeta `.claude/agents/` de tu proyecto:

```bash
mkdir -p .claude/agents docs
cp flujo-de-caja.md .claude/agents/
cp REFERENCIA-FLUJO-DE-CAJA.md docs/referencia-flujo-de-caja.md
```

Los **dos** archivos son necesarios. El agente lee `docs/referencia-flujo-de-caja.md` antes de
calcular un indicador o dar una recomendación: ahí están las fórmulas, los benchmarks con su fuente,
el calendario tributario colombiano y la clasificación de qué dato está verificado y cuál no.

Verifica que quedó registrado abriendo Claude Code en el proyecto y ejecutando `/agents`.
Debe aparecer `flujo-de-caja` en la lista.

A partir de ahí lo invocas así:

```
> usa el agente flujo-de-caja para implementar la proyección a 90 días
```

Claude Code también lo activará solo cuando detecte que la tarea es de caja, gracias al
campo `description` del archivo.

---

## Paso 1 — Prompt de arranque

Pega esto tal cual en Claude Code, en la raíz del proyecto:

> Usa el agente `flujo-de-caja`.
>
> Antes de escribir una sola línea de código, explora el proyecto y reportame:
> 1. Versión de Next.js y si usa App Router o Pages Router.
> 2. Cómo se conecta a Supabase (cliente del servidor, del navegador, service role) y
>    dónde están las migraciones.
> 3. Qué tablas existen ya relacionadas con contabilidad: cuentas, terceros, facturas,
>    pagos, asientos, cuentas bancarias. Dame el esquema real de cada una.
> 4. Si hay multi-tenant y con qué campo se separa (`org_id`, `company_id`, etc.).
> 5. Qué librería de gráficos y de UI usa el proyecto.
>
> No modifiques nada todavía. Cuando tenga tu reporte te confirmo el plan.

**No saltes este paso.** El 80% de los errores en este tipo de módulo vienen de crear
tablas paralelas a las que ya existían.

---

## Paso 2 — Modelo de datos

Después de conocer el esquema real, el agente debe **adaptar** esto a lo que ya existe,
no copiarlo ciegamente. Los nombres son sugerencias; los conceptos no son negociables.

```sql
-- Cuentas de efectivo y equivalentes
create table cash_accounts (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  name          text not null,
  type          text not null check (type in ('bank','cash','ewallet','credit_line')),
  bank_name     text,
  account_number_last4 text,
  currency      char(3) not null default 'COP',
  ledger_account_code text,          -- enlace al PUC (ej. 1110)
  opening_balance numeric(18,2) not null default 0,
  opening_date  date not null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- Movimientos reales de efectivo (una fila = un movimiento de caja)
create table cash_movements (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  account_id    uuid not null references cash_accounts(id),
  occurred_at   timestamptz not null,            -- fecha real del movimiento de caja
  amount        numeric(18,2) not null,          -- positivo = entrada, negativo = salida
  currency      char(3) not null default 'COP',
  fx_rate       numeric(18,6) not null default 1,
  description   text,
  counterparty_id uuid references parties(id),   -- tercero: cliente o proveedor
  -- Clasificación NIC 7
  nic7_category text check (nic7_category in ('operating','investing','financing')),
  nic7_source   text check (nic7_source in ('rule','manual','import')) default 'rule',
  nic7_confidence numeric(4,3),                  -- 0..1, null si es manual
  needs_review  boolean not null default false,
  -- Trazabilidad
  source_document_type text,                     -- 'invoice','bill','payroll','journal'
  source_document_id   uuid,
  bank_reference text,
  imported_batch_id uuid,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id)
);

-- Clave anti-duplicados para importación de extractos
create unique index cash_movements_dedupe
  on cash_movements (org_id, account_id, bank_reference, occurred_at, amount)
  where bank_reference is not null;

create index cash_movements_org_date on cash_movements (org_id, occurred_at desc);

-- Compromisos futuros: lo que vamos a cobrar y lo que vamos a pagar
create table cash_commitments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  direction     text not null check (direction in ('inflow','outflow')),
  kind          text not null check (kind in ('receivable','payable','payroll','tax','loan','recurring','other')),
  counterparty_id uuid references parties(id),
  amount        numeric(18,2) not null check (amount > 0),
  currency      char(3) not null default 'COP',
  due_date      date not null,
  expected_date date not null,        -- due_date ajustada por DSO/DPO del tercero
  probability   numeric(4,3) not null default 1.0 check (probability between 0 and 1),
  status        text not null default 'pending'
                check (status in ('pending','partial','settled','written_off','cancelled')),
  settled_amount numeric(18,2) not null default 0,
  source_document_type text,
  source_document_id   uuid,
  created_at    timestamptz not null default now()
);

create index cash_commitments_projection
  on cash_commitments (org_id, status, expected_date);

-- Reglas de clasificación automática
create table cash_classification_rules (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  priority      int not null default 100,
  match_ledger_prefix text,     -- ej. '51' -> gastos de administración
  match_party_id uuid references parties(id),
  match_description_regex text,
  match_amount_min numeric(18,2),
  match_amount_max numeric(18,2),
  assign_category text not null check (assign_category in ('operating','investing','financing')),
  confidence    numeric(4,3) not null default 0.9,
  is_active     boolean not null default true
);

-- Parámetros de caja por organización
create table cash_settings (
  org_id        uuid primary key references organizations(id) on delete cascade,
  minimum_buffer numeric(18,2) not null default 0,   -- colchón mínimo de caja
  functional_currency char(3) not null default 'COP',
  timezone      text not null default 'America/Bogota',
  collection_probabilities jsonb not null default
    '{"0-30":0.95,"31-60":0.85,"61-90":0.65,"90+":0.35}'::jsonb,
  interest_paid_category text not null default 'operating'
);

-- Snapshots de proyección, para comparar real vs. proyectado después
create table cash_forecast_snapshots (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  generated_at  timestamptz not null default now(),
  horizon_days  int not null,
  scenario      text not null check (scenario in ('conservative','base','optimistic')),
  assumptions   jsonb not null,
  daily_balances jsonb not null   -- [{date, opening, inflow, outflow, closing}]
);
```

**Obligatorio en todas las tablas:**

```sql
alter table cash_accounts            enable row level security;
alter table cash_movements           enable row level security;
alter table cash_commitments         enable row level security;
alter table cash_classification_rules enable row level security;
alter table cash_settings            enable row level security;
alter table cash_forecast_snapshots  enable row level security;

-- Y una política por tabla, del estilo:
create policy "org members read cash_movements" on cash_movements
  for select using (org_id in (
    select org_id from org_members where user_id = auth.uid()
  ));
```

Ajusta la política a como el proyecto ya resuelve la membresía. Si el proyecto no tiene
multi-tenant, omite `org_id` — pero confírmalo, no lo asumas.

---

## Paso 3 — Lógica de negocio

Toda la lógica de cálculo va en `lib/cash-flow/`, en funciones puras, **sin acceso a
base de datos adentro**. Reciben datos, devuelven resultados. Así se pueden probar.

```
lib/cash-flow/
├── types.ts             # CashMovement, Commitment, ForecastDay, Scenario…
├── money.ts             # aritmética en centavos, redondeo bancario, formato COP
├── balance.ts           # saldo actual, saldo disponible, serie histórica diaria
├── forecast.ts          # proyección 30/60/90 y los tres escenarios
├── aging.ts             # antigüedad de cartera, DSO, DPO, ciclo de conversión
├── classify.ts          # motor de reglas NIC 7
├── statement.ts         # estado de flujo de efectivo, método directo e indirecto
├── alerts.ts            # detección de días bajo el colchón, runway, concentración
└── __tests__/
```

### Fórmulas que deben quedar implementadas

**Proyección diaria**

```
closing(d) = closing(d-1) + inflows(d) - outflows(d)
closing(hoy) = saldo real consolidado    // ancla obligatoria
```

**Fecha esperada de cobro**

```
expected_date = due_date + DSO_del_tercero
DSO_tercero = promedio(fecha_pago - fecha_vencimiento) de sus facturas pagadas
              en los últimos 12 meses
si no hay historia -> DSO global de la organización
si tampoco hay -> 0 días
```

**Escenarios**

| Escenario | Comprometidos | Estimados | Probabilidad de cobro |
|---|---|---|---|
| Conservador | 100% | 0% | probabilidad × 0.7 |
| Base | 100% | 100% | probabilidad configurada |
| Optimista | 100% | 100% | mín(probabilidad × 1.2, 1.0) |

**Runway**

```
quema_neta_mensual = promedio(salidas - entradas) de los últimos 3 meses de operación
runway_dias = (saldo_actual - colchon_minimo) / (quema_neta_mensual / 30)
si quema_neta <= 0 -> "flujo positivo, sin runway aplicable"
```

**Antigüedad de cartera** — cubos por `hoy - due_date`: corriente (≤0), 1–30, 31–60,
61–90, +90. La suma de los cubos debe igualar el total de cuentas por cobrar; escribe la
prueba.

**Método indirecto**

```
Utilidad neta
+ depreciación y amortización
+ provisiones
± variación de cuentas por cobrar        (aumento resta caja)
± variación de inventarios
± variación de cuentas por pagar         (aumento suma caja)
= Flujo de operación
+ Flujo de inversión
+ Flujo de financiación
= Variación del efectivo    <-- debe igualar saldo_final - saldo_inicial
```

Si esa última igualdad falla, el reporte muestra la diferencia como partida de descuadre
visible. Nunca la escondas ni la cuadres con un plug silencioso.

---

## Paso 4 — Rutas y pantallas

```
app/(dashboard)/flujo-de-caja/
├── page.tsx                    # Dashboard principal
├── proyeccion/page.tsx         # Proyección 30/60/90 con escenarios
├── cartera/page.tsx            # Por cobrar y por pagar, antigüedad
├── movimientos/page.tsx        # Listado, filtros, clasificación manual
├── reportes/page.tsx           # Estado de flujo de efectivo + exportables
└── configuracion/page.tsx      # Colchón mínimo, probabilidades, reglas
```

### Dashboard — lo que ve el dueño en 5 segundos

Orden de arriba hacia abajo, porque es el orden en que importa:

1. **Saldo hoy** consolidado, grande, con el desglose por cuenta al pasar el mouse.
2. **Alerta de faltante**: "El 14 de octubre el saldo proyectado cae a $1.200.000, por
   debajo de tu colchón de $5.000.000." Si no hay alerta, un estado tranquilo, no un
   espacio vacío.
3. **Gráfico de proyección a 90 días**: línea del escenario base, banda sombreada entre
   conservador y optimista, línea punteada del colchón mínimo, marcador en el día del
   cruce. La parte histórica y la proyectada se distinguen visualmente (sólido vs.
   punteado) — el usuario tiene que ver dónde termina el hecho y empieza el estimado.
4. **Cuatro tarjetas**: por cobrar (y cuánto está vencido), por pagar (y cuánto vence
   esta semana), runway en días, quema neta mensual.
5. **Próximos 15 días**: tabla de entradas y salidas comprometidas, ordenada por fecha.

Reglas de presentación:

- Toda cifra proyectada lleva un indicador visual que la distingue de una cifra real.
- Los montos en COP se formatean con separador de miles y sin decimales en las tarjetas
  (`$12.450.000`), con decimales en las tablas de detalle.
- Cada número del dashboard debe ser clicable hasta llegar a los movimientos que lo
  componen. Un número que no se puede auditar no genera confianza.
- Estados vacíos con instrucción concreta: "Aún no hay facturas por cobrar registradas.
  Impórtalas desde…" y no un "Sin datos".

---

## Paso 5 — Orden de trabajo

Trabaja por fases y **entrega funcionando** al final de cada una. No empieces la
siguiente sin que la anterior tenga sus pruebas en verde.

| Fase | Alcance | Termina cuando |
|---|---|---|
| 1 | Migraciones, RLS, tipos, `money.ts`, `balance.ts` | El saldo consolidado real se ve en pantalla y cuadra con la contabilidad existente |
| 2 | Clasificación NIC 7: reglas, override manual, cola de revisión | Todo movimiento histórico queda clasificado o marcado para revisión |
| 3 | Cartera: `aging.ts`, DSO, DPO, pantalla de cartera | La antigüedad suma el total de por cobrar y por pagar |
| 4 | Proyección: `forecast.ts`, 13 semanas, escenarios, alertas, gráfico | La proyección a 0 días iguala el saldo actual y las alertas disparan correctamente |
| 5 | Motor colombiano: retenciones, calendario DIAN, prestaciones | El neto proyectado coincide con el neto que realmente entra |
| 6 | Reportes: método directo e indirecto, exportables XLSX y PDF | Ambos métodos cuadran contra la variación real del efectivo |
| 7 | Snapshots, varianza y autoevaluación del pronóstico | Se ve qué tan acertada fue la proyección del mes pasado, separando timing de monto |
| 8 | Motor de asesoría: indicadores, semáforo, diagnóstico | El sistema dice qué está pasando y qué hacer, con cifras propias |

---

## Paso 6 — Pruebas obligatorias

Ninguna fase se da por terminada sin estas pruebas escritas y pasando:

```
✓ directo y indirecto producen el mismo flujo neto
✓ operación + inversión + financiación = saldo_final - saldo_inicial
✓ proyección a 0 días == saldo actual
✓ importar el mismo extracto dos veces no duplica movimientos
✓ los cubos de antigüedad suman el total de cartera
✓ agregación de 10.000 movimientos no pierde ni gana centavos
✓ usuario de org A no lee datos de org B
✓ factura pagada parcialmente reduce el compromiso, no lo elimina
✓ nota crédito reduce la cartera del tercero correcto
✓ anticipo de cliente entra a caja sin crear una cuenta por cobrar negativa
✓ movimiento del 31 a las 20:00 hora Bogotá cuenta en ese mes, no en el siguiente
✓ organización sin historial: la proyección usa comprometidos y lo declara
```

---

## Paso 7 — Cómo pedir cada fase

Una fase por conversación, con contexto explícito:

> Usa el agente `flujo-de-caja`. Implementa la **Fase 3 (cartera)** del brief.
> Las fases 1 y 2 ya están en `lib/cash-flow/`. Antes de codificar, muéstrame cómo vas a
> calcular el DSO por tercero con las tablas que existen, y qué haces cuando un cliente
> no tiene facturas pagadas en los últimos 12 meses.

Si el agente propone algo que no entiendes contablemente, pídele que te lo explique con
un ejemplo numérico antes de aceptarlo. Las decisiones de este módulo se quedan en tus
estados financieros.

---

## Notas para Colombia

- Moneda funcional COP, `numeric(18,2)`, formato `$ 1.234.567,89`.
- Zona horaria `America/Bogota` para todos los cortes de período.
- Si el proyecto maneja PUC, las clases relevantes para caja son 11 (disponible),
  13 (deudores), 22 (proveedores), 23 (cuentas por pagar), 24 (impuestos).
- Retención en la fuente y ReteICA reducen el efectivo recibido: la entrada de caja es
  el neto, la retención se registra como un activo por impuestos, no como menor ingreso.
- IVA cobrado no es tuyo: considéralo una salida comprometida en la fecha de vencimiento
  de la declaración. Es la causa número uno de sorpresas de caja en PYMES.
- Prima de servicios (junio y diciembre) y cesantías (febrero) son salidas grandes y
  predecibles: deben aparecer en la proyección aunque no estén facturadas.

---

## Paso 8 — Motor colombiano (Fase 5)

Estas tres cosas hacen la diferencia entre un módulo genérico y uno que sirve en Colombia.

### 8.1 Proyectar el neto, no el bruto

De una factura de honorarios de $10.000.000 + IVA, con retefuente 11%, ReteIVA 15% y ReteICA,
entran **≈$10.418.400** de los $11.900.000 facturados. **Cerca del 12,5% no llega a la cuenta.**

```sql
-- La entrada proyectada de un compromiso por cobrar
alter table cash_commitments
  add column gross_amount    numeric(18,2),   -- valor facturado
  add column withholding_amount numeric(18,2) default 0,
  add column net_amount      numeric(18,2);   -- lo que realmente entra

-- amount (el que usa la proyección) = net_amount, nunca gross_amount
```

Tabla de tarifas configurable, no hardcodeada:

```sql
create table withholding_rates (
  org_id       uuid not null references organizations(id) on delete cascade,
  concept      text not null,        -- 'servicios','honorarios','compras','arrendamiento'
  rate         numeric(6,4) not null,
  min_base_uvt numeric(10,2),
  applies_from date not null,
  source_note  text,                 -- 'Decreto 572/2025, vigente desde 1-jul-2026'
  primary key (org_id, concept, applies_from)
);

create table tax_parameters (
  org_id      uuid primary key references organizations(id) on delete cascade,
  uvt_value   numeric(18,2) not null,     -- 2026: 52374
  usury_rate  numeric(6,4),               -- ago-2026: 0.2966 -- CAMBIA CADA MES
  ibc_rate    numeric(6,4),               -- ago-2026: 0.1977
  min_wage    numeric(18,2),              -- 2026: 1750905
  transport_allowance numeric(18,2),      -- 2026: 249095
  vat_frequency text check (vat_frequency in ('bimestral','cuatrimestral')),
  last_verified_at date not null
);
```

**Ningún parámetro tributario va escrito en el código.** Entre febrero y agosto de 2026 la tasa de
usura pasó de 25,23% a 29,66% E.A. Una constante hardcodeada habría quedado obsoleta en seis meses.
El campo `last_verified_at` debe mostrarse en la interfaz de configuración.

### 8.2 Pre-cargar el calendario de salidas

Estas salidas existen aunque nadie las haya registrado. El módulo las genera automáticamente:

| Mes | Evento | Base |
|---|---|---|
| Enero 31 | Intereses sobre cesantías | 12% anual sobre cesantías |
| **Febrero 14** | **Consignación de cesantías** | 8,33% de la nómina anual |
| Mensual, día hábil 2–16 | Retención en la fuente + PILA | — |
| Mar/may/jul/sep/nov | IVA bimestral (o may/sep si es cuatrimestral) | Umbral: 92.000 UVT |
| **Mayo y julio** | **Renta personas jurídicas, 2 cuotas** | — |
| **Junio 30** | **Prima de servicios** | 8,33% |
| Bimestral | ICA municipal | — |
| **Diciembre 20** | **Prima de servicios** | 8,33% |

Junio, diciembre, mayo y julio son los meses críticos. **Febrero es el que más sorprende**, porque
las cesantías se consignan justo cuando la caja de enero quedó floja.

### 8.3 Ley de Pago en Plazos Justos

La Ley 2024 de 2020 obliga a las grandes empresas y entidades estatales a pagar a las MIPYMEs en
**máximo 45 días calendario**, con intereses moratorios desde el día 46. El módulo debe marcar
automáticamente las facturas a clientes grandes que superen ese plazo y ofrecer al usuario un texto
de reclamación que cite la ley.

---

## Paso 9 — Motor de asesoría (Fase 8)

Lo que convierte el módulo en un asesor y no en un reporte.

```
lib/cash-flow/advisor/
├── indicators.ts    # DSO, BPDSO, ADD, DPO, DIO, CCC, CEI, runway, colchón, Altman Z''
├── diagnose.ts      # árbol de causas: síntoma → causa raíz
├── recommend.ts     # palancas priorizadas por caja liberada ÷ esfuerzo
└── thresholds.ts    # umbrales configurables, calibrados a Colombia
```

### 9.1 Panel de indicadores

Todos con su fórmula en `docs/referencia-flujo-de-caja.md`. Los que no pueden faltar:

| Indicador | Por qué está aquí |
|---|---|
| **Días de colchón de caja** | La mediana de las PYMES es 27 días. Es el número que dice cuánto aguantas |
| **Runway** | Días hasta cero al ritmo actual de quema |
| **DSO / BPDSO / ADD** | Separan el problema de cobranza del problema de plazos otorgados |
| **CEI** | No se distorsiona con el volumen de ventas, a diferencia del DSO |
| **CCC = DSO + DIO − DPO** | Días con el efectivo atrapado. Cada día vale dinero |
| **Flujo operativo ÷ Utilidad neta** | Menor a 1 sostenido = utilidades que no se vuelven efectivo. La alerta más temprana |
| **Concentración de cartera** | % de los cobros de 13 semanas que dependen de 1–2 clientes |
| **Altman Z''(EM)** | Alerta de insolvencia calibrada para mercados emergentes |

### 9.2 El árbol de diagnóstico

Codifícalo, no lo dejes al criterio del momento:

```
Saldo proyectado rompe el piso
├── ¿Flujo operativo ÷ utilidad neta < 1 sostenido?
│   └── Sí → las utilidades no se vuelven efectivo → revisar cartera e inventario
├── ¿ADD alto y BPDSO bajo?
│   └── Sí → falla de COBRANZA → secuencia de recordatorios, contacto en 24h
├── ¿BPDSO alto?
│   └── Sí → falla de POLÍTICA DE CRÉDITO → presionar a cartera no lo resuelve
├── ¿DPO < DSO?
│   └── Sí → la empresa financia su propio ciclo → negociar plazos, confirming
├── ¿DIO creciendo con ventas planas?
│   └── Sí → inventario inflado → reporte de SKU sin movimiento
├── ¿La varianza es de timing o de monto?
│   ├── Timing → ajustar calendario de desembolsos, NO recortar costos
│   └── Monto → recortar o financiar
└── ¿Tres trimestres girando la línea al tope?
    └── Sí → NO es problema de caja: es problema de modelo de negocio. Decirlo.
```

### 9.3 Formato de salida de una recomendación

Siempre estos cuatro campos. Nunca una recomendación genérica:

```
Qué hacer          → la acción concreta
Cuánta caja libera → cifra calculada con los datos de ESTA empresa
Cuándo se ve       → días o semanas hasta que el efectivo entra
De qué depende     → el supuesto que la sostiene y qué la rompe
```

Máximo tres por diagnóstico, ordenadas por caja liberada ÷ esfuerzo. Una lista de quince acciones
no se ejecuta.

### 9.4 Calibración a Colombia

**No copies umbrales de Estados Unidos.** En América Latina el plazo promedio de pago es de 59 días
y el retraso promedio de 42; Colombia tiene los plazos más cortos de la región con 50 días. **Un DSO
de 60–70 días aquí no es anómalo.** Si el sistema alerta sobre lo normal, el usuario deja de leer
las alertas — incluidas las que sí importan.

### 9.5 Autoevaluación del pronóstico (Fase 7)

Guarda cada proyección y califícala contra el real en cuatro dimensiones: precisión, sesgo,
volatilidad y persistencia del error. Necesita 6 o más períodos de datos pareados. Separa siempre
**varianza de timing** (reversible, se ajusta el calendario) de **varianza de monto** (permanente,
se recorta o se financia).

Solo el 14% de los equipos financieros mide esto. Un pronóstico que no se mide no mejora, y el
sesgo sistemático (siempre optimista, siempre pesimista) es invisible sin esta medición.

---

## Pruebas adicionales de las fases 5 a 8

```
✓ el neto proyectado de una factura coincide con el neto que realmente entró
✓ cambiar la tarifa de retención en configuración recalcula las proyecciones futuras, no las pasadas
✓ el calendario tributario genera la salida de prima el 30 de junio y el 20 de diciembre
✓ la consignación de cesantías aparece el 14 de febrero aunque nadie la haya registrado
✓ empresa con ingresos bajo 92.000 UVT recibe calendario de IVA cuatrimestral, no bimestral
✓ los indicadores con datos insuficientes devuelven "no calculable", nunca un número inventado
✓ el diagnóstico distingue varianza de timing de varianza de monto en un caso construido
✓ el árbol de diagnóstico llega a la misma causa con los mismos datos (es determinista)
✓ ningún parámetro tributario aparece hardcodeado en el código (prueba de grep)
```

---

## Advertencia sobre las cifras de este brief

Las cifras tributarias y laborales corresponden a **agosto de 2026** y varias están marcadas como
volátiles en `docs/referencia-flujo-de-caja.md`. Tres normas colombianas que afectan caja fueron
suspendidas o anuladas judicialmente durante 2026. Antes de una decisión material, verifica contra
la fuente oficial y consulta a tu contador o revisor fiscal.
