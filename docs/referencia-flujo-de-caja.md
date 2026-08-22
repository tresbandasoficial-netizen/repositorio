# Referencia de Flujo de Caja — base de conocimiento del agente

Este archivo es la memoria del agente `flujo-de-caja`. Guárdalo en tu proyecto (sugerencia:
`docs/referencia-flujo-de-caja.md`) y el agente lo consulta antes de calcular, diagnosticar
o recomendar.

**Investigación realizada el 22 de agosto de 2026.** Cada dato lleva su fuente. La sección 9
clasifica qué está verificado y qué no: léela antes de usar una cifra en una decisión real.

---

## 0. Cómo leer la confiabilidad de cada dato

| Marca | Significado |
|---|---|
| **[DATO]** | Medición real sobre una muestra, publicada por la fuente |
| **[CONVENCIÓN]** | Rango aceptado en la literatura financiera, sin muestra estadística |
| **[NO VERIFICADO]** | Circula sin fuente primaria. No usar para decidir |
| **[VOLÁTIL]** | Cambia con frecuencia (mensual o por norma). Verificar antes de usar |

El agente nunca presenta un [NO VERIFICADO] como si fuera un [DATO].

---

## 1. Indicadores: fórmulas y rangos

### 1.1 Ciclo de conversión de efectivo

| Indicador | Fórmula | Qué mide |
|---|---|---|
| **DSO** | (Cuentas por cobrar ÷ Ventas a crédito) × días del período | Días para cobrar una venta |
| **DIO** | (Inventario ÷ Costo de ventas) × días del período | Días que el inventario está quieto |
| **DPO** | (Cuentas por pagar ÷ Costo de ventas) × días del período | Días para pagar a proveedores |
| **CCC** | DIO + DSO − DPO | Días con el efectivo atrapado en la operación |

El estándar del Credit Research Foundation usa **ventas a crédito**, no ventas totales, y
cartera final del período. Ser consistente importa más que la variante elegida.
Fuente: [CRF Performance Measures](https://www.crfonline.org/wp-content/uploads/2017/12/PerformanceMeasures.pdf)

**Regla de oro: si DPO < DSO, la empresa está financiando su propio ciclo con capital propio.**
Meta mínima: DPO ≥ DSO.

**Cada día de CCC vale dinero.** Un día menos de DSO libera (ventas diarias × 1) en caja, de una
sola vez. Un día menos de DIO libera (costo de ventas diario × 1).

### 1.2 Las tres métricas de cartera que separan el problema real

Aquí está el diagnóstico que casi nadie hace bien:

| Métrica | Fórmula | Para qué sirve |
|---|---|---|
| **BPDSO** (mejor DSO posible) | (Cartera **corriente**, no vencida × días) ÷ Ventas a crédito | El DSO que tendrías si nadie pagara tarde |
| **ADD** (días promedio de mora) | DSO − BPDSO | La mora real, aislada de los plazos otorgados |
| **% corriente** | Cartera corriente ÷ Cartera total | Salud de la cartera |
| **% mayor a 91 días** | Saldo >90 días ÷ Cartera total | Riesgo de incobrabilidad |

**Cómo se lee:**
- **ADD alto + BPDSO bajo** → el problema es la cobranza. Actúa sobre el proceso de recaudo.
- **BPDSO alto** → el problema son los plazos que comercial está otorgando. Actúa sobre la
  política de crédito, no sobre el equipo de cartera.

Esta distinción evita el error más común de la gerencia: presionar al de cobranza cuando el
problema lo creó el de ventas.

### 1.3 CEI — índice de efectividad de cobranza

```
CEI = [(Cartera inicial + Ventas a crédito − Cartera final total)
     ÷ (Cartera inicial + Ventas a crédito − Cartera final corriente)] × 100
```

| CEI | Lectura |
|---|---|
| < 70% | Crisis de cobranza |
| 70–85% | Proceso por mejorar |
| > 85% | Proceso maduro |

Fuente: [Chaser](https://www.chaserhq.com/blog/collection-effectiveness-index) — la propia fuente
advierte que ningún corte único aplica universalmente. **[CONVENCIÓN]**

**Ventaja del CEI sobre el DSO:** el DSO se distorsiona con el volumen de ventas. Si las ventas
suben, el DSO baja aunque la cobranza haya empeorado. El CEI no tiene ese sesgo.

### 1.4 Liquidez

| Indicador | Fórmula | Rango sano |
|---|---|---|
| Razón corriente | Activo corriente ÷ Pasivo corriente | 1,5 – 3,0 **[CONVENCIÓN]** |
| Prueba ácida | (Efectivo + equivalentes + CxC) ÷ Pasivo corriente | ≥ 1,0 **[CONVENCIÓN]** |
| Razón de efectivo | (Efectivo + equivalentes) ÷ Pasivo corriente | 0,50 – 1,00 **[CONVENCIÓN]** |
| KTNO | Clientes + Inventarios − Proveedores | Positivo |

Fuentes: [Wall Street Prep](https://www.wallstreetprep.com/knowledge/acid-test-ratio/),
[Allianz Trade](https://www.allianz-trade.com/en_US/insights/cash-ratio.html),
[Siempre al Día — Colombia](https://siemprealdia.co/colombia/finanzas/indicadores-de-liquidez/)

**Advertencia crítica: ese rango no aplica a todos los sectores.** Datos reales de prueba ácida
por sector **[DATO]**, [Eqvista sobre TradingView, feb-2025](https://eqvista.com/acid-test-quick-ratio-by-industry/):

| Sector | Prueba ácida |
|---|---|
| Tiendas de descuento | 0,28 |
| Retail de alimentos | 0,64 |
| Aerolíneas | 0,84 |
| Restaurantes | 1,08 |
| Retail por internet | 1,45 |
| Semiconductores | 4,06 |
| Software | 6,88 |

Amazon opera hoy con razón corriente 1,03 y prueba ácida 0,84 — por debajo del rango "sano" — sin
riesgo alguno ([Stock Analysis, 22-ago-2026](https://stockanalysis.com/stocks/amzn/statistics/)).
**Un negocio que cobra de contado vive sano por debajo de 1,0.** Comparar siempre contra el sector.

### 1.5 Razones de flujo de caja

| Indicador | Fórmula | Referencia |
|---|---|---|
| Operating Cash Flow Ratio | Flujo operativo ÷ Pasivo corriente | 1,0 – 2,0; <1,0 riesgo |
| Cash Flow Coverage | Flujo operativo ÷ Deuda total | Lo más alto posible |
| Cash Flow Margin | Flujo operativo ÷ Ventas netas | Más confiable que el margen neto |
| **Calidad de utilidades** | Flujo operativo ÷ Utilidad neta | **≈1 o más = utilidades reales** |
| Free Cash Flow | Flujo operativo − CapEx | — |
| FCF margin | FCF ÷ Ingresos × 100 | — |

Fuentes: [AccountingTools](https://www.accountingtools.com/articles/cash-flow-ratios.html),
[Emagia](https://www.emagia.com/resources/glossary/good-operating-cash-flow-ratio/)

**El indicador más subestimado es Flujo operativo ÷ Utilidad neta.** Cuando cae por debajo de 1
de forma sostenida, la empresa está reportando utilidades que no se convierten en efectivo:
o la cartera está creciendo más rápido que las ventas, o el inventario se está inflando. Es la
señal más temprana de un problema estructural, y aparece antes que cualquier alerta de saldo.

Ojo: *Current Liability Coverage Ratio* y *Operating Cash Flow Ratio* son **la misma fórmula** con
nombres distintos según la fuente. Verificar la definición antes de comparar contra un benchmark ajeno.

### 1.6 Burn rate y runway

```
Gross burn  = total de egresos de efectivo del mes
Net burn    = egresos − ingresos de efectivo del mes
Runway      = saldo de caja ÷ net burn mensual
```

Referencia: se apunta típicamente a **6–12 meses** de runway. En una encuesta a fondos de capital
de riesgo de 2024, 53,7% aconsejó 6–12 meses y 29,6% más de 18 meses.
Fuente: [CFI](https://corporatefinanceinstitute.com/resources/valuation/cash-runway-explained/)

*Gross burn* mide qué tan cara es la operación. *Net burn* mide la velocidad real de destrucción
de caja. Se puede bajar el net burn creciendo ingresos sin tocar la estructura de costos.

### 1.7 Días de colchón de caja — el número que más importa a una PYME

```
Días de colchón = saldo de caja ÷ egresos diarios promedio
```

**[DATO]** Estudio del JPMorgan Chase Institute sobre **597.000 pequeñas empresas y 470 millones
de transacciones** (feb–oct 2015):

- **Mediana: 27 días.** Percentil 25: **13 días.** Percentil 75: 62 días.
- Negocios intensivos en mano de obra: 23 días. Intensivos en capital: 38 días.

| Sector | Días de colchón (mediana) |
|---|---|
| Restaurantes | 16 |
| Reparación y mantenimiento | 18 |
| Retail | 19 |
| Construcción | 20 |
| Servicios personales | 21 |
| Mayoristas | 23 |
| Metal y maquinaria | 28 |
| Servicios de salud | 30 |
| Manufactura high-tech | 32 |
| Servicios profesionales | 33 |
| Inmobiliario | 47 |

Fuente: [JPMorgan Chase Institute](https://www.jpmorganchase.com/institute/all-topics/business-growth-and-entrepreneurship/report-cash-flows-balances-and-buffer-days)

**Los datos son de 2015 y no hay actualización con muestra comparable.** Úsalos como estructura
relativa entre sectores, no como nivel absoluto de 2026.

**La implicación para el diseño del producto:** con 27 días de margen mediano, un error de
pronóstico de dos semanas es existencial. Por eso la alerta de ruptura de caja es la
funcionalidad más importante del módulo, no el reporte bonito.

### 1.8 Alerta temprana de insolvencia — Altman Z''

Para PYMES colombianas la variante correcta es **Z'' para mercados emergentes**, no la Z original:

```
Z'' = 6,56·(CT/AT) + 3,26·(UR/AT) + 6,72·(EBIT/AT) + 1,05·(Patrimonio libros / Pasivo total)
Z''(EM) = 3,25 + Z''

CT = capital de trabajo, AT = activo total, UR = utilidades retenidas
```

| Zona | Rango (mercados emergentes) |
|---|---|
| Segura | > 2,6 |
| Gris | 1,1 – 2,6 |
| Angustia | < 1,1 |

Fuente: [CreditGuru](https://www.creditguru.com/index.php/bankruptcy-and-insolvency/altman-z-score-insolvency-predictor-for-non-manufacturers-emerging-markets)

Para empresas privadas manufactureras existe la variante Z' (zonas: >2,9 segura, 1,23–2,9 gris,
<1,23 angustia).

---

## 2. Benchmarks reales

### 2.1 Capital de trabajo — The Hackett Group

**[DATO] 1.000 mayores empresas no financieras de EE.UU., publicado 18-ago-2025:**

| Métrica | Valor |
|---|---|
| CCC | **37 días** (−4%, mejora) |
| DPO | **59 días** (+3%) |
| Capital de trabajo excedente | US$1,7 billones = **11% de los ingresos** |
| Brecha de DSO entre cuartil superior y mediana | **18 días** |

Fuente: [Hackett EE.UU.](https://www.thehackettgroup.com/2025-working-capital-survey-payables-rebound-receivables-inventory-lag/)

**[DATO] 1.000 mayores empresas europeas, FY2024:**

| Métrica | Valor |
|---|---|
| CCC | **44,8 días** (+3%, deterioro por 3er año) |
| DSO | **48,5 días** |
| DIO | **68,9 días** (máximo en una década) |
| DPO | **72,6 días** |

Fuente: [Hackett Europa](https://www.thehackettgroup.com/2025-europe-working-capital-survey-cash-cycle-deterioration/)

Estos son los benchmarks con más peso estadístico disponibles públicamente. Son de grandes
empresas: una PYME normalmente tiene un CCC peor, no mejor.

### 2.2 Comportamiento de pago en América Latina y Colombia

**[DATO]** Coface, Encuesta de Comportamiento de Pago Corporativo en América Latina 2025
(más de 300 empresas, 6 países):

| Métrica | 2025 | 2024 |
|---|---|---|
| Plazo de pago promedio | **59 días** | 53 |
| Retraso de pago promedio | **42 días** | 52 |
| Empresas que reportan pagos tardíos | **77%** | 51% |
| Empresas que otorgan crédito | 86% | 88% |

**Colombia tiene los plazos más cortos de la región: 50 días.** Brasil el más largo (66).
Ecuador el mayor retraso (70). Argentina y Chile los menores (26–27).

Fuente: [Coface](https://www.coface.com/news-economy-and-insights/2025-latin-america-corporate-payment-survey-longer-payment-terms-and-rising-delays)

**Implicación para una PYME colombiana: un DSO de 60–70 días no es anómalo aquí**, aunque esté muy
por encima del DSO europeo de 48,5. El ADD alto es estructural en Colombia. El agente debe
calibrar sus alertas contra esta realidad y no contra benchmarks de EE.UU.

### 2.3 Probabilidad de cobro por antigüedad

**[NO VERIFICADO como benchmark sectorial.]** Rangos ilustrativos que circulan en la literatura:

| Antigüedad | Probabilidad de cobro |
|---|---|
| Corriente (0–30) | 80–95% |
| 31–60 | 50–85% |
| 61–90 | 30–65% |
| +90 | 10–35% |

Fuente: [Numeric](https://www.numeric.io/blog/cash-flow-forecasting-guide)

**Estos números son un punto de partida, no un benchmark.** El agente debe **calcular la
probabilidad real con el historial propio de la empresa** en cuanto haya 12 meses de datos, y
sustituir los valores por defecto. Un porcentaje prestado de otra industria es una suposición
con apariencia de autoridad.

### 2.4 Tasas de DSO por industria

Las tablas de DSO por industria que circulan en blogs (retail 5–20, SaaS 30–45, manufactura
45–60, construcción 60–90) **no citan fuente primaria**: al consultarlas, derivan de conversaciones
con fundadores. **[NO VERIFICADO]** — sirven como orden de magnitud, no como benchmark defendible.
CSIMarket tiene el dato real pero bajo licencia comercial.

---

## 3. Pronóstico de caja: el estándar profesional

### 3.1 Por qué 13 semanas

Es el estándar de la práctica de tesorería y de reestructuración, por dos razones:

1. **13 semanas = un trimestre fiscal completo**, alineado con los ciclos de reporte.
2. **La precisión se degrada con el horizonte.** Trece semanas es el punto donde el detalle
   semanal sigue siendo defendible.

Permite detectar un déficit **8 a 10 semanas antes de que ocurra** — tiempo suficiente para
gestionar una línea de crédito o acelerar cobranzas.

Fuentes: [Atlar](https://www.atlar.com/learn/what-is-the-13-week-cash-flow-forecast),
[Abacum](https://www.abacum.ai/blog/13-week-cash-flow)

**Estructura:**

```
Saldo inicial (semana N)
+ Entradas de caja
− Salidas de caja
= Saldo final  →  saldo inicial de la semana N+1
```

Usa **método directo** exclusivamente: recibos y desembolsos reales, sin partidas no monetarias.

**Rollforward semanal:** al cerrar cada semana se elimina la más antigua, se sustituye el
pronóstico por los reales, se concilia la varianza y se añade una semana nueva al final.
La ventana siempre mira 13 semanas hacia adelante.

**Cuándo una empresa debe adoptarlo (gatillos operativos):** runway por debajo de 3 meses,
dificultad para cubrir nómina, quejas frecuentes de proveedores por facturas vencidas, o
incumplimiento de pagos de deuda.
Fuente: [HighRadius](https://www.highradius.com/resources/Blog/build-13-week-cash-flow-forecast/)

### 3.2 Qué método para qué horizonte

| | **Directo** | **Indirecto** |
|---|---|---|
| Horizonte | ≤ 13 semanas | Multianual, estratégico |
| Granularidad | Diaria, semanal | Mensual, trimestral |
| Insumos | Movimientos reales, CxC/CxP, extractos | P&G y balance proyectados |
| Uso | Liquidez del día a día | Planeación, inversión, financiamiento |
| Precisión | Alta en el corto plazo | Menor; los supuestos de capital de trabajo la erosionan |

Combinación horizonte / bucket recomendada: pronóstico semanal → buckets diarios; 13 semanas →
semanales; anual → mensuales; 5 años → anuales o trimestrales.

Fuentes: [Atlar](https://www.atlar.com/learn/what-are-the-direct-and-indirect-forecasting-methods),
[Numeric](https://www.numeric.io/blog/cash-flow-forecasting-guide)

### 3.3 Drivers de proyección

Catálogo de fórmulas de [Oracle Planning & Budgeting](https://docs.oracle.com/en/cloud/saas/planning-budgeting-cloud/casha/cash_driver_based_forecast_methods.html):

```
Cobranza por ingresos:   Entrada = Monto del ingreso × % del término de pago
Cobranza por hito:       Monto del hito = Valor del contrato × % del hito
Driver DSO:              Entrada = Ingreso pendiente × (DSO promedio / días del período)
                         Ingreso pendiente = CxC inicial + ventas a crédito del período
Pagos de gastos:         Salida = Monto del gasto × % del término de pago
Pagos recurrentes:       Salida = Monto × frecuencia (arriendo, seguros)
Nómina anualizada:       Salida mensual = Salario anual / 12
Impuestos:               1ª cuota = Pasivo fiscal anual × % de cuota
                         Cuotas siguientes = Pasivo actualizado × % − pagado
Driver DPO:              Salida = Gasto pendiente × (DPO promedio / días del período)
```

**El error sistemático más común, y el que el agente debe evitar por diseño:**

> Modelar la cobranza según los **términos contractuales** (neto 30) en lugar del
> **comportamiento observado** (45+ días). Un cliente que paga 45 días tarde cada mes,
> pagará 45 días tarde el próximo mes.

Fuente: [A Faster Exit](https://afasterexit.com/guides/13-week-cash-flow-forecast/)

### 3.4 Escenarios y sensibilidad

**No son lo mismo:** el escenario mueve **varias variables a la vez**; la sensibilidad mueve
**una sola** dejando el resto fijo.

**El orden correcto de trabajo —y el que casi nadie sigue:**

1. Construir el modelo base.
2. Correr **sensibilidad** para descubrir qué drivers realmente mueven la aguja.
3. Construir **escenarios alrededor de esos drivers ya probados**, no de supuestos arbitrarios.

Fuente: [Farseer](https://www.farseer.com/blog/scenario-planning-or-sensitivity-analysis/)

| Escenario | Supuestos |
|---|---|
| Optimista | Cobranza más rápida, mejores costos, condiciones favorables |
| Base | Métricas actuales, variables conocidas |
| Conservador | **Pagos que llegan más tarde**, costos crecientes, contracción, estacionalidad baja |

**Clave del escenario conservador:** no basta con asumir que las entradas son *menores*. Hay que
asumir que **llegan más tarde**. El retraso mata más empresas que el monto.

**Argumento de credibilidad:** mantener los tres escenarios **siempre**, no construir el pesimista
cuando ya llegó el problema. Cuando aparece el estrés, el escenario a la baja ya está calibrado —
eso demuestra preparación ante un banco en vez de improvisación.

### 3.5 Varianza real vs. proyectado

```
Varianza = Real − Pronóstico
Varianza % = (Real − Pronóstico) ÷ Pronóstico × 100
```

Signo: para **entradas** favorable es Real − Pronóstico; para **salidas** es Pronóstico − Real.

**Las tres categorías de causa — la taxonomía que cambia la decisión:**

| Tipo | Qué pasó | ¿Se recupera? | Qué hacer |
|---|---|---|---|
| **Timing** | El dinero se movió de semana, el monto es el mismo | **Sí, reversible** | Ajustar el calendario de desembolsos |
| **Volumen** | Cambió el monto esperado (ventas, precio) | **No, permanente** | Reducir costos o buscar financiamiento |
| **Gasto** | El egreso real difiere del estimado | **No, permanente** | Corregir el supuesto y la ejecución |

Fuente: [Intuit Enterprise](https://erp.intuit.com/blog/financials/cash-flow-variance-analysis/)

Confundir una varianza de timing con una permanente lleva a recortar costos cuando solo había que
mover una fecha. Es un error caro y muy frecuente.

**Umbrales de error aceptable — [NO VERIFICADO como estándar normativo].** No existe un estándar
publicado por AFP, AICPA ni una Big Four. Hay consenso direccional entre fuentes secundarias que
**no coinciden exactamente entre sí**:

| Semanas | Umbral orientativo |
|---|---|
| 1–4 | ±5% |
| 5–8 | ±10% |
| 9–13 | ±15% a ±20% |

**Regla de acción:** una varianza superior al 15% en las semanas tempranas señala que hay que
refinar supuestos, no que hubo mala suerte. Y el umbral porcentual siempre debe acompañarse de un
**umbral absoluto en pesos**: 5% en una empresa de $10.000 millones son $500 millones que exigen
investigación inmediata.

**El umbral defendible se deriva de los datos propios**, no se toma prestado: acumula 6 o más
períodos de pares pronóstico-vs-real y fija el umbral en función de tu dispersión histórica.

**[DATO] Solo el 14% de los equipos financieros mide formalmente la precisión de sus pronósticos**
(2026 AFP FP&A Benchmarking Survey). El 86% no tiene sistema de medición.
Fuente: [AFP](https://www.financialprofessionals.org/training-resources/resources/articles/Details/your-forecast-does-not-have-a-score-it-should)

AFP propone puntuar el pronóstico en cuatro dimensiones (escala 0–100, donde <25 es disciplina de
nivel institucional y >60 es fragilidad estructural), con 6 o más períodos de datos:

1. **Precisión** — desviación promedio respecto al real
2. **Sesgo** — si los errores se inclinan sistemáticamente en una dirección
3. **Volatilidad** — estabilidad del patrón de error
4. **Persistencia** — si los errores se repiten (¿el equipo aprende?)

**Esto es una funcionalidad, no solo teoría:** el módulo debe guardar cada pronóstico y calificarse
a sí mismo contra el real. Un pronóstico que no se mide no mejora.

### 3.6 Errores comunes en PYMES

**De supuestos:** sobrestimar entradas; modelar términos contractuales en vez de comportamiento
real; omitir salidas recurrentes (impuestos de nómina, amortizaciones, prepagos); pasivos olvidados
que crean acantilados sorpresa (indemnizaciones, impuestos de suma alzada); ignorar estacionalidad.

**De proceso:** tratarlo como ejercicio único en vez de documento vivo; correrlo aislado del reporte
financiero; datos sin conciliar; **dependencia de una sola persona** que se lleva el conocimiento
del modelo en la cabeza.

**De sesgo — los dos más peligrosos:**
- **Sandbagging:** pronosticar bajo a propósito para "superar el número". Destruye el valor del
  pronóstico como herramienta de decisión.
- **Optimismo bajo presión:** la precisión se degrada **justo antes** de que el estrés se acelere.
  El modelo falla precisamente cuando más se necesita.

### 3.7 Frecuencia de actualización

La frecuencia la determina **la volatilidad de la caja y la tensión de liquidez, no el tamaño de
la empresa**.

| Situación | Frecuencia |
|---|---|
| Operación normal, horizonte de 13 semanas | Semanal (mínimo) |
| Liquidez tensa o volatilidad alta | Más que semanal |
| Posición de caja inestable | Diaria |
| Horizonte anual | Mensual, con el cierre |

El modo de falla dominante **no es actualizar poco: es abandonar el pronóstico en períodos de alta
carga de trabajo.** Por eso conviene un horario semanal fijo e inamovible.

**Contexto [DATO]** (encuesta AFP vía [CTMfile](https://ctmfile.com/story/treasury-cash-forecasting-rising-expectations-growing-complexity-ais-promise)):
53% encuentra el pronóstico "difícil" en 2025 contra 39% en 2018. **79% de las empresas con
ingresos menores a US$1.000 millones** lo priorizan, contra 73% de las mayores — **la presión es
mayor en las empresas pequeñas.**

---

## 4. Colombia: lo que saca caja y cuándo

> **[VOLÁTIL] 2026 ha sido un año de inestabilidad jurídica en Colombia.** Tres normas que impactan
> caja fueron suspendidas o anuladas judicialmente durante el año. El agente debe tratar estas
> cifras como parámetros configurables, nunca como constantes en el código, y advertir al usuario
> que verifique antes de una decisión material.

**UVT 2026 = $52.374** (Resolución DIAN 000238 del 15-dic-2025).

### 4.1 Calendario tributario

No existe decreto anual de plazos: el **Decreto 2229 de 2023** fijó plazos permanentes por último
dígito del NIT.
Fuentes: [DIAN calendario](https://www.dian.gov.co/Contribuyentes-Plus/Paginas/Calendario-de-obligaciones.aspx),
[Decreto 2229](https://normograma.dian.gov.co/dian/compilacion/docs/decreto_2229_2023.htm)

| Obligación | Periodicidad | Umbral | Meses de vencimiento 2026 |
|---|---|---|---|
| Renta grandes contribuyentes | 3 cuotas | Calificación DIAN | Feb (20%) · Abr (50%) · Jun |
| **Renta personas jurídicas** | 2 cuotas iguales | — | **Mayo y julio** |
| **IVA bimestral** | 6 al año | Ingresos año anterior **≥ 92.000 UVT** | Mar, may, jul, sep, nov, ene-2027 |
| **IVA cuatrimestral** | 3 al año | Ingresos **< 92.000 UVT** | May, sep, ene-2027 |
| **Retención en la fuente** | **Mensual** | Todo agente retenedor | Día hábil 2 al 16 del mes siguiente |
| **GMF (4×1000)** | **Semanal** | Recaudo bancario | 2º día hábil siguiente a cada semana |
| ICA Bogotá bimestral | 6 al año | > 391 UVT liquidados | Abr, jun, ago, oct, dic, feb-2027 |

**Impuesto al patrimonio para personas jurídicas — nuevo en 2026.** Decreto 0173 de 2026: umbral
de patrimonio líquido ≥ 200.000 UVT ($10.474.800.000) al 1-mar-2026; tarifa 0,5% general y 1,6%
para financieras, aseguradoras y extractivas; pago en 2 cuotas (1-abr y 4-may-2026).
**[VOLÁTIL]** — es un decreto de emergencia económica y existe precedente de caída
(el Decreto 1474/2025 fue declarado inexequible por Sentencia C-079 de 2026).
Fuentes: [Holland & Knight](https://www.hklaw.com/en/insights/publications/2026/02/nuevo-impuesto-al-patrimonio-para-personas-juridicas-en-colombia),
[BDO](https://www.bdo.com.co/es-co/publicaciones/boletines-tax/tax-alert-decreto-de-emergencia-economica-0173-de-2026)

### 4.2 Retenciones: lo que NO entra a la cuenta

El **Decreto 572 de 2025** recuperó plena vigencia el **1 de julio de 2026** y bajó drásticamente
las bases mínimas: servicios de 4 UVT a **2 UVT ($104.748)** y compras a **10 UVT ($523.740)**.
Efecto de caja: **muchas más facturas pequeñas quedan sujetas a retención**.
Fuentes: [DIAN Decreto 572](https://normograma.dian.gov.co/dian/compilacion/docs/decreto_0572_2025.htm),
[INCP](https://incp.org.co/publicaciones/infoincp-publicaciones/impuestos/2026/06/el-1-de-julio-volveran-a-regir-las-tarifas-de-autorretencion-y-retencion-del-decreto-572-de-2025/)

| Concepto | Tarifa | Base mínima 2026 |
|---|---|---|
| Compras generales | 2,5% declarantes / 3,5% | 10 UVT = $523.740 |
| Servicios generales | 4% declarantes / 6% | 2 UVT = $104.748 |
| **Honorarios y comisiones, persona jurídica** | **11%** | Sin base mínima |
| Honorarios, persona natural | 10% u 11% | Sin base mínima |
| Arrendamiento de inmueble | 3,5% | 10 UVT |
| Arrendamiento de mueble | 4% | Sin base mínima |
| Autorretención especial en renta | 0,55% – 4,5% según CIIU | Sobre cada ingreso |
| **ReteIVA** | **15% del IVA** | — |
| ReteICA Bogotá | Tarifa por actividad (por mil) | — |

**Ejemplo obligatorio para entender el módulo — factura de honorarios de $10.000.000 + IVA:**

| Concepto | Valor |
|---|---|
| Subtotal | $10.000.000 |
| IVA 19% | $1.900.000 |
| **Total facturado** | **$11.900.000** |
| (−) Retefuente 11% | ($1.100.000) |
| (−) ReteIVA 15% del IVA | ($285.000) |
| (−) ReteICA ~9,66×1000 | ($96.600) |
| **Efectivo que realmente entra** | **≈ $10.418.400** |

**Se factura $11,9 millones y entran $10,4 millones: cerca del 12,5% del valor facturado no llega
a la cuenta.** Ese dinero es un activo (anticipo de impuesto), no un gasto — pero no es caja
disponible hasta la declaración de renta del año siguiente. Y el IVA de $1.900.000 tampoco es de
la empresa.

**Esta es la regla más importante del módulo para Colombia:** la proyección de entradas debe
calcularse sobre el **neto después de retenciones**, nunca sobre el valor facturado. Proyectar
sobre el bruto sobreestima la caja en más de 10% de forma sistemática.

### 4.3 GMF (4×1000)

- Tarifa 4 por mil sobre disposición de recursos. Recaudo semanal por los bancos.
- La exención de 350 UVT mensuales ($18.330.900) aplica a **personas naturales** en una cuenta
  marcada, **no a la operación de una sociedad**.
- **50% del GMF pagado es deducible en renta** (art. 115 ET), sin exigir relación de causalidad.

**Peso real:** una empresa que rota $1.000 millones al mes en pagos soporta unos **$4 millones
mensuales ($48 millones al año)** de GMF, de los cuales solo la mitad genera escudo fiscal.
Es un costo de **fricción de tesorería: crece con el número de movimientos, no con la utilidad.**
Consolidar pagos reduce este costo directamente.
Fuente: [actualicese](https://actualicese.com/transacciones-exentas-del-gmf-en-2026/)

### 4.4 Costos laborales y sus fechas

**Salario mínimo 2026: $1.750.905 · Auxilio de transporte: $249.095** (Decretos 1469 y 1470 del
29-dic-2025, incremento del 23%). Vigente tras revocarse la suspensión en julio de 2026, aunque
la nulidad de fondo sigue pendiente **[VOLÁTIL]**.
Fuente: [Holland & Knight](https://www.hklaw.com/en/insights/publications/2025/12/colombia-decreta-aumento-del-salario-minimo-y-auxilio-de-transporte)

| Prestación | Fecha límite | Base |
|---|---|---|
| **Prima 1er semestre** | **30 de junio** | 8,33% |
| **Prima 2º semestre** | **20 de diciembre** | 8,33% |
| **Intereses sobre cesantías** (al trabajador) | **31 de enero** | 12% anual sobre cesantías |
| **Consignación de cesantías al fondo** | **14 de febrero** | 8,33% |
| Vacaciones | 15 días hábiles/año | 4,17% |
| Dotación (≤2 SMLMV) | 30 abr · 31 ago · 20 dic | — |
| Seguridad social (PILA) | Día hábil 2–16 del mes siguiente | — |

| Aporte | Empleador | Trabajador |
|---|---|---|
| Salud | 8,5% (exonerado si <10 SMLMV) | 4% |
| Pensión | 12% | 4% |
| ARL | 0,522% – 6,960% según riesgo | — |
| SENA | 2% (exonerado si <10 SMLMV) | — |
| ICBF | 3% (exonerado si <10 SMLMV) | — |
| Caja de compensación | **4% — nunca exonerado** | — |

Exoneración del art. 114-1 ET: personas jurídicas contribuyentes de renta, por empleados que
devenguen menos de 10 SMLMV (~$17,5 millones en 2026).

**Provisión mensual sugerida: 45%–52% del salario** con exoneración plena; **50%–57%** sin
exoneración. Este rango es un cálculo derivado, no una cifra oficial publicada.

**Reforma laboral (Ley 2466 de 2025) — sobrecosto escalonado [DATO]:**

| Cambio | Vigencia |
|---|---|
| Recargo nocturno desde las 7:00 p.m. (antes 9:00 p.m.), 35% | 25-dic-2025 |
| Recargo dominical/festivo 80% | 1-jul-2025 |
| **Recargo dominical/festivo 90%** | **1-jul-2026** |
| Recargo dominical/festivo 100% | 1-jul-2027 |
| Jornada máxima 42 horas semanales | Julio 2026 |

Fuente: [Ley 2466 — Función Pública](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=260676)

### 4.5 Los picos de caja del año colombiano

El agente debe pre-cargar estos eventos en toda proyección, aunque no estén facturados:

| Mes | Salidas concentradas |
|---|---|
| **Enero** | Intereses sobre cesantías (31) |
| **Febrero** | **Consignación de cesantías (14)** + ICA bimestral |
| **Marzo** | IVA bimestral |
| **Abril** | ICA · patrimonio (si aplica) |
| **Mayo** | **Renta personas jurídicas, 1ª cuota** + IVA |
| **Junio** | **Prima de servicios (30)** + ICA |
| **Julio** | **Renta personas jurídicas, 2ª cuota** + IVA |
| **Agosto** | ICA |
| **Diciembre** | **Prima (20)** + dotación + ICA |

**Junio, diciembre, mayo y julio son los cuatro meses críticos.** Febrero es el que más sorprende
porque las cesantías se consignan justo cuando la caja de enero quedó floja.

### 4.6 Marco contable aplicable

| Grupo | Criterio | Marco | ¿Estado de flujos de efectivo? |
|---|---|---|---|
| **1** | Emisores de valores, entidades de interés público, >200 empleados o >30.000 SMMLV en activos con condiciones adicionales | NIIF Plenas | **Sí — NIC 7** |
| **2** | Las que no clasifican en 1 ni en 3 | NIIF para PYMES | **Sí — Sección 7** |
| **3** | Microempresas: ≤10 trabajadores, activos <500 SMMLV, ingresos <6.000 SMMLV | Contabilidad simplificada | **No** — solo situación financiera, resultados y notas |

**Qué exige la NIC 7** ([texto oficial](https://www.mef.gob.pe/contenidos/conta_publ/con_nor_co/niif/NIC_7_BV2022_GVT.pdf)):

- **Párr. 1** — el estado de flujos de efectivo es **parte integrante** de los estados financieros.
- **Párr. 10** — clasificación obligatoria en operación, inversión y financiación.
- **Párr. 18–19** — se permiten ambos métodos; **el párrafo 19 recomienda el directo** porque
  "suministra información útil en la estimación de los flujos de efectivo futuros".
- **Párr. 7** — equivalentes al efectivo: inversiones de alta liquidez con vencimiento
  **≤3 meses desde la adquisición**.

En la práctica colombiana predomina el indirecto, aunque la norma privilegia el directo. **El
módulo debe producir los dos**, y el directo es el que le sirve al dueño para tomar decisiones.

### 4.7 Ley de Pago en Plazos Justos — la palanca legal

**Ley 2024 de 2020**: las grandes empresas y entidades estatales deben pagar a las MIPYMEs en
**máximo 45 días calendario** (desde enero de 2022), contados desde la entrega a satisfacción.
Genera derecho a **intereses moratorios desde el día 46**. Vigilada por la SIC y la
Superintendencia de Sociedades. Los contratos entre grandes empresas están exceptuados.

Fuentes: [Ley 2024 — SUIN](https://www.suin-juriscol.gov.co/viewDocument.asp?id=30039609),
[Bancolombia](https://blog.bancolombia.com/negocios/ley-de-pago-a-plazos-justos/)

**Uso práctico:** si eres MIPYME y un cliente grande te paga a 90 días, lo estás financiando gratis
y con la ley en contra de él. El agente debe detectar automáticamente estos casos en la cartera y
sugerir citar la ley por escrito en el recordatorio del día +7.

### 4.8 Facturación electrónica y RADIAN

Norma consolidadora: **Resolución DIAN 000165 de 2023**.

- **Validación previa obligatoria**: la factura se transmite y valida ante la DIAN **antes** de
  entregarse al adquirente.
- La **regla de 48 horas** solo aplica en contingencia por fallas tecnológicas de la DIAN.
- **Documento soporte**: lo emite el comprador en adquisiciones a no obligados a facturar; puede
  ser acumulado semanal por proveedor.
- **RADIAN** es el registro que permite negociar la factura electrónica como título valor.
  **Sin los eventos registrados en RADIAN, la factura no es negociable** — es decir, no se puede
  hacer factoring con ella.

Fuentes: [Resolución 165](https://normograma.dian.gov.co/dian/compilacion/docs/resolucion_dian_0165_2023.htm),
[DIAN RADIAN](https://micrositios.dian.gov.co/sistema-de-facturacion-electronica/radian/)

**Relación con la caja:** el ingreso se reconoce por devengo (NIIF 15), no por recaudo. La factura
validada dispara **simultáneamente** la obligación de IVA y la causación del ingreso — **antes de
cobrar**. Ese descalce es la raíz del problema de caja de las PYMES colombianas: pagas el IVA de
una factura que aún no te han pagado.

### 4.9 Costo del dinero en Colombia

**[VOLÁTIL — la Superfinanciera lo certifica mensualmente. Verificar siempre antes de usar.]**

| Referencia | Agosto 2026 | Febrero 2026 |
|---|---|---|
| Interés bancario corriente (consumo y ordinario) | **19,77% E.A.** | 16,82% E.A. |
| **Tasa de usura** | **29,66% E.A.** | 25,23% E.A. |

Fuentes: [Portafolio / Resolución 1139 de 2026](https://www.portafolio.co/economia/finanzas/superfinanciera-fijo-la-tasa-de-usura-en-29-66-estas-son-las-deudas-que-mas-se-encarecen-499499),
[Superfinanciera](https://www.superfinanciera.gov.co/publicaciones/10115999/superfinanciera-certifica-el-interes-bancario-corriente/)

**El salto de casi 3 puntos entre febrero y agosto de 2026 es exactamente por qué esta cifra nunca
debe quedar escrita en el código.** Va en configuración, con fecha de última verificación.

---

## 5. Palancas de asesoría: qué recomendar y cuándo

### 5.1 Acelerar cobranzas

**El dato de mayor retorno de todo este documento** — probabilidad de cobro según cuándo se hace
el primer contacto tras un incumplimiento:

| Momento del primer contacto | Probabilidad de éxito |
|---|---|
| **Dentro de 24 horas** | **65%** |
| A los 3 días | 45% |
| A los 7 días | 30% |
| A los 14+ días | **15%** |

Fuente: [CreditPulse](https://www.creditpulse.com/blog/days-sales-outstanding-dso-by-industry-2025-benchmarks-data-analysis)

**Implicación:** la palanca más rentable no es "cobrar mejor", es **cobrar el día 1**. Si hoy el
primer contacto ocurre a los 10 días, moverlo a 24 horas cuadruplica la tasa de éxito sin costo
adicional. Esto debe ser una funcionalidad del módulo, no un consejo.

**Secuencia de recordatorios recomendada:**

| Momento | Canal | Tono | Objetivo |
|---|---|---|---|
| −7 días | Email | Cortés | Detectar disputas **antes** del vencimiento |
| Día 0 | Email | Profesional | Empujón el mismo día |
| +7 días | Email | Firme y específico | Declarar la mora |
| +14 días | Email + SMS | Factual, directo | Canal nuevo = urgencia |
| +21 días | SMS + llamada | Firme | Contacto humano |
| +30 días | Llamada al superior jerárquico | Escalamiento | Involucrar al decisor |
| +45–60 días | Aviso final formal | Formal | Último paso antes de cobranza jurídica |

**SMS tiene ~90% de apertura contra 20–30% del email**, y añadirlo a la secuencia acelera el pago
**5 a 7 días**. Fuente: [Yonovo](https://www.yonovo.com/blog/invoice-reminder-best-practices)

**Diagnóstico rápido — DSO Efficiency Ratio = DSO real ÷ plazo otorgado:**

| Valor | Lectura |
|---|---|
| 1,00 – 1,15 | Excelente |
| 1,15 – 1,30 | Aceptable |
| **> 1,50** | **Problema de caja que se compone en el tiempo** |

**Scoring de clientes — correlación observada:**

| Score crediticio | Comportamiento |
|---|---|
| 750+ | Paga en plazo o antes |
| 650–699 | Paga **15–25% por encima** del plazo |
| < 650 | Paga **40–60% por encima** del plazo |

**Política de crédito mínima ejecutable:**
- Solicitud firmada y autorización de consulta en centrales de riesgo antes de otorgar plazo.
- Cliente nuevo o score <650: **100% anticipado o contra entrega** los primeros 3 pedidos.
- Límite de crédito por cliente con **bloqueo automático de despacho** al superarlo o al tener una
  factura vencida a más de 30 días. *Un límite sin bloqueo automático no es una política, es un deseo.*
- **Concentración:** ningún cliente debe representar más del 15–20% de los cobros esperados de las
  próximas 13 semanas. Por encima de eso, modelar el escenario en que ese cobro se atrasa.

**Cuándo enviar a cobranza jurídica:** tras 3–4 recordatorios sin respuesta y 45–60 días de mora.
Criterio económico: envía cuando (monto × probabilidad de recuperación, que a esa altura ya cayó a
~15%) supere el costo del proceso más el valor de la relación comercial. Por debajo de ese punto,
negocia un plan de pagos o castiga la cartera y libera el tiempo del equipo.

### 5.2 Descuento por pronto pago: la fórmula que cambia la decisión

```
Costo anualizado ≈ [ d ÷ (1 − d) ] × [ 360 ÷ (N − D) ]

d = % de descuento    N = plazo neto    D = días para tomar el descuento
```

**2/10 neto 30** → (0,02 / 0,98) = 2,04% por 20 días → × 18 períodos = **36,7% E.A.**
**1/10 neto 30** → ≈ **18,2% E.A.**

Fuente: [Tipalti](https://tipalti.com/resources/learn/210-net-30/)

**Si lo OFRECES (eres el vendedor):** solo tiene sentido si tu costo marginal de financiar ese
capital de trabajo supera el costo del descuento. Con la usura colombiana en 29,66% E.A. y el IBC
en 19,77% E.A. (agosto 2026), **regalar un 2/10 neto 30 sale más caro que endeudarte con el banco.**
Un 1/10 neto 30 sí compite con crédito bancario.

**Si te lo OFRECEN (eres el comprador):** no tomar un 2/10 neto 30 equivale a endeudarte al 36,7%
E.A. Tómalo si tu costo de fondeo es menor — en Colombia casi cualquier línea formal lo es.
**Excepción absoluta: si tu caja proyectada a 13 semanas toca el piso mínimo en algún punto,
ningún descuento por pronto pago se toma.** En escasez de liquidez la prioridad no es el costo del
dinero, es la supervivencia.

### 5.3 Cascada de prioridad cuando el efectivo es escaso

Orden recomendado ([debt.org](https://www.debt.org/small-business/prioritizing-your-bills/)),
adaptado a Colombia:

1. **Impuestos y seguridad social** (retenciones, IVA recaudado, PILA) — es dinero de terceros;
   incumplir escala a sanciones, embargos y responsabilidad personal.
2. **Nómina** — sin equipo no hay operación, y hay sanciones por mora salarial.
3. **Cuentas vencidas a 60+ días** — dañan el score comercial y acumulan intereses.
4. **Servicios públicos y arriendo** — desconexión y desalojo son eventos terminales.
5. **Proveedores críticos** (sin sustituto rápido) — negocia pago parcial, no silencio.
6. **Deuda garantizada o con aval personal** — riesgo de patrimonio propio.
7. **Seguros** — reduce cobertura antes que dejar caer la póliza.
8. **Tarjetas y deuda no garantizada** — requieren fallo judicial para ejecutar.
9. **Suscripciones y gastos no esenciales.**

**Regla de comportamiento:** nunca dejar de comunicar. Un proveedor al que le anuncias un pago
parcial el día 25 es un aliado; el mismo proveedor sin noticias el día 40 corta el suministro.

### 5.4 Inventario

**El costo de mantener inventario es 20–30% de su valor por año**
([Nventory](https://nventory.io/us/glossary/dead-stock)).

**Consecuencia que casi nadie calcula: liquidar inventario muerto con 30% de descuento es
financieramente neutro contra mantenerlo un año más** — y estrictamente positivo si valoras la
caja liberada hoy.

**Umbrales de detección:** alertas a 60, 90 y 120 días sin venta. Clasificación como stock muerto
a 90, 180 o 365 días según la rotación normal de la categoría.

**Plan de ataque, en orden:**
1. Reporte de SKUs sin movimiento a 90/180/365 días. Es una consulta, no un proyecto.
2. Clasificación **ABC**: los SKU A (≈20% que generan ≈80% del valor) con control estricto; los C
   se racionalizan o pasan a pedido.
3. Liquidar los C muertos: descuento profundo, bundling con alta rotación, canales de liquidación,
   devolución al proveedor.
4. **Consignación / VMI** para baja rotación y alto valor: el proveedor mantiene la propiedad hasta
   la venta. Saca el inventario de tu caja y de tu balance; a cambio pagas un precio unitario mayor.
5. **JIT en PYME**: solo donde el proveedor tenga lead time corto y confiable. Mal implementado,
   convierte un problema de caja en quiebres de stock y ventas perdidas.

### 5.5 Financiamiento de capital de trabajo

**Factoring — tarifas mensuales por sector** ([Crestmont Capital](https://www.crestmontcapital.com/blog/invoice-factoring-rates)):

| Sector | Tasa mensual |
|---|---|
| Staffing | 1–3% |
| Transporte | 1,5–5% |
| Manufactura y distribución | 1–4% |
| Servicios IT y profesionales | 1,5–3,5% |
| Construcción | 2–6% |
| Salud | 3–8% |

- Anticipo típico **70–95%** del valor de la factura.
- **Sin recurso cuesta 0,5–1,5% mensual adicional** frente a con recurso. Es la prima del seguro de
  crédito: tómala solo si la quiebra de ese cliente te haría quebrar a ti.
- APR efectiva reportada: 12% a más de 60%.

**Fórmula del costo efectivo real — las dos trampas:**

```
Costo E.A. ≈ (Comisión total % ÷ Anticipo %) × (365 ÷ días hasta el cobro REAL)
```

Trampa 1: el descuento se calcula sobre el **valor facial**, pero solo recibes el **anticipo**
(eleva el costo real ~11% si el anticipo es 90%). Trampa 2: el reloj corre hasta que el cliente
paga **de verdad**, no hasta la fecha de vencimiento.

**Colombia:** la factura electrónica se negocia como título valor a través de **RADIAN**. Sin los
eventos registrados ahí, la factura no es negociable. Plataformas de crowdfactoring anticipan hasta
el 85%. **[NO VERIFICADO]** — no hay tarifas de factoring colombiano publicadas de forma
verificable; pídelas por escrito y anualízalas con la fórmula antes de firmar.

**Confirming / reverse factoring:** el banco paga de contado a tus proveedores y tú le pagas
después. En Bancolombia opera con plazos **de 1 a 180 días**, tasa fija o variable indexada a
**DTF**, base 360, con y sin responsabilidad del pagador
([Bancolombia](https://www.bancolombia.com/negocios/productos/financiacion/factoring/confirming)).
Sirve cuando **tu perfil crediticio es mejor que el de tus proveedores**.

**Bancóldex** no presta directo: redescuenta a través de bancos aliados, y **la tasa final la pone
el intermediario**. Cotiza el mismo cupo con dos o tres bancos.
([Bancóldex líneas de crédito](https://www.bancoldex.com/lineas-de-credito))

**Árbol de decisión:**

| Situación | Instrumento |
|---|---|
| Estacionalidad predecible, empresa bancarizada | **Línea rotativa** — el más barato |
| Cartera concentrada en clientes grandes y solventes | **Factoring con recurso** vía RADIAN |
| Riesgo real de impago de un cliente grande | **Factoring sin recurso** (paga la prima) |
| Eres comprador con buen crédito y tus proveedores aprietan | **Confirming** |
| Descalce de 3–5 días entre entradas y salidas | **Sobregiro**, solo para eso |
| Inversión productiva a 3–5 años | **Redescuento Bancóldex** vía banco aliado |

**Regla de oro: nunca financies un déficit estructural con instrumentos de corto plazo.** Si llevas
tres trimestres girando la línea al tope, no tienes un problema de caja: tienes un problema de
modelo de negocio. El agente debe decir esto cuando lo detecte.

### 5.6 Precio: la palanca más rápida sobre la caja

**[DATO]** Sobre estados de resultados promedio del S&P 1500
([McKinsey, *The power of pricing*](https://www.mckinsey.com/capabilities/growth-marketing-and-sales/our-insights/the-power-of-pricing)):

| Movimiento de 1% | Efecto en utilidad operativa |
|---|---|
| **Precio** | **+8%** |
| Costo variable | +5,3% |
| Volumen | +2,7% |

**El precio es ~1,5× más potente que el costo variable y ~3× más potente que el volumen.** Y llega
a la caja en el ciclo de facturación siguiente, mientras que un recorte de costos tarda semanas o
meses (y muchos recortes cuestan caja antes de ahorrarla).

El lado oscuro, de la misma fuente: **−1% de precio → −8% de utilidad operativa**, y **un recorte
de 5% exige +18,7% de volumen solo para no perder.**

**Fórmula del umbral de decisión** (derivación algebraica estándar):

```
Pérdida máxima tolerable de volumen (%) = − Δp ÷ (MC% + Δp)

Δp = cambio de precio como % del precio    MC% = margen de contribución actual
```

Ejemplo: margen de contribución 40%, alza de precio 5% → puedes perder hasta 5/(40+5) = **11,1%
del volumen** y seguir igual de rentable. **Ese es el número con el que se responde a la objeción
de "vamos a perder clientes".**

**Tácticas de precio sin subir la lista:** eliminar descuentos automáticos por antigüedad, cobrar
el flete y cargos accesorios que hoy absorbes, **indexación por IPC** en contratos anuales, reducir
el rango de descuento que puede autorizar un vendedor, y subir primero los SKU de baja elasticidad.

**[NO VERIFICADO]** No existe una cifra de elasticidad-precio confiable para PYMES: es
idiosincrática por producto y mercado. Estímala con una prueba controlada (un segmento, un canal,
60 días) antes de aplicarla a toda la base.

### 5.7 Estructura de costos: orden de recorte

El criterio es **caja liberada por peso de daño operativo**, y la variable clave es **la velocidad
con la que el ahorro se convierte en efectivo**:

1. **Gasto discrecional** (viajes, marketing no atribuible, suscripciones, consultorías) — efecto
   en días, daño reversible.
2. **CapEx no comprometido** — diferir es gratis.
3. **Costos variables de volumen no rentable** — deja de vender lo que tiene margen de
   contribución negativo.
4. **Renegociación de contratos fijos** (arriendo, software, logística) — efecto en 30–60 días.
5. **Personal — último, y por dos razones:** la indemnización es una **salida** de caja en el mes 1
   con ahorro solo desde el mes 2 o 3, y la capacidad perdida es la más cara de recuperar.

**Renegociación de arriendo:** la moneda de cambio es el **plazo**. Ofrece extender 2–3 años a
cambio de 3–6 meses de reducción o diferimiento. Para el arrendador, un contrato largo con inquilino
que paga vale más que una vacancia.

**Sale-leaseback:** libera **~100% del valor de la propiedad**, contra **65–75% de un refinanciamiento
con retiro de efectivo**. Precio de venta = Renta anual ÷ Cap rate. Arriendos típicos de 10 a 20
años, casi siempre triple neto.
Fuente: [The Cauble Group](https://www.tylercauble.com/blog/what-is-a-sale-leaseback-transaction)
**Cuándo sí:** hay equity real, permanencia de largo plazo en esa ubicación, y reinversión a un
retorno superior al cap rate implícito. **Cuándo no:** posibilidad de mudarse o reducirse en pocos
años, o una renta resultante que ahogaría la operación.

---

## 6. Sistema de alertas: semáforo sobre 13 semanas

| Nivel | Disparador | Acción |
|---|---|---|
| 🟢 **VERDE** | Las 13 semanas quedan por encima del piso mínimo | Revisión semanal de rutina, un responsable nombrado |
| 🟡 **ÁMBAR** | El pronóstico se acerca al piso en algún punto | Revisar supuestos, foco en cobranzas, congelar gasto discrecional y CapEx no comprometido |
| 🔴 **ROJO** | Ruptura proyectada del piso en cualquier semana | Escalamiento inmediato, activar playbook de crisis |

Fuente: [Float](https://www.floatapp.com/blog/early-warning-system-cash-flow)

**Indicadores adelantados a monitorear cada semana:**

1. **Saldo mínimo proyectado y su fecha** — el número más importante del tablero.
2. **Deriva de días de cobro** — DSO creciendo por encima del plazo pactado varios meses seguidos,
   o cartera migrando a buckets de mayor antigüedad.
3. **Concentración de cartera** — % de los cobros de las próximas 13 semanas que dependen de 1 o 2
   clientes.
4. **Varianza pronóstico vs. real**, separando **timing** de **monto**. La varianza adversa repetida
   en el *timing* de los ingresos alerta antes que el propio saldo.
5. **Headroom de las líneas de crédito** — cupo no utilizado contra el valle proyectado, **más la
   fecha de vencimiento o revisión de la línea**. Que te venzan la línea justo en el valle es un
   error clásico y evitable.
6. **Flujo operativo ÷ Utilidad neta < 1 sostenido** — utilidades que no se vuelven efectivo.

**Escalera de deterioro estructural, en gravedad creciente:**

1. Financiar operación corriente con la línea rotativa al tope.
2. Estirar proveedores sin acuerdo previo.
3. **Retrasar retenciones o seguridad social — punto de no retorno.** A partir de aquí es crisis,
   no tensión.
4. No poder cubrir nómina.

---

## 7. Playbook: los primeros 30 días de una crisis de liquidez

Basado en la secuencia que ejecuta un CFO de crisis
([CE Interim](https://ceinterim.com/13-week-cash-flow-forecast-crisis-cfo/)).

**Días 1–7 — Ver.**
1. Construir el **flujo de caja de 13 semanas** sobre **recaudos y desembolsos reales**, no sobre
   devengo. Es la primera acción, antes de cualquier decisión.
2. Definir el **piso mínimo de caja** (sugerencia: 4 semanas de costos fijos + nómina) y marcar la
   semana del valle.
3. Congelar CapEx no comprometido, contrataciones, gasto discrecional y **todos los descuentos por
   pronto pago a proveedores**.
4. Levantar el **aging completo** y llamar a los 10 mayores deudores esa misma semana.
   *Contacto en 24 h = 65% de éxito; a los 14 días = 15%.*

**Días 8–15 — Estabilizar.**
5. Instaurar la **cadencia semanal**: un responsable nombrado, comité de caja de 30 minutos,
   semáforo, y varianza pronóstico-vs-real separando timing de monto.
6. Aplicar la **cascada de prioridad de pagos**.
7. Llamar proactivamente a los proveedores críticos con una **propuesta concreta** (monto y fecha),
   antes de que ellos llamen. El silencio es lo que corta el suministro.
8. Verificar **headroom y fecha de vencimiento** de todas las líneas. Si alguna vence dentro de las
   13 semanas, renegociarla es prioridad de esta semana.

**Días 16–30 — Generar caja.**
9. **Cartera:** activar la secuencia (−7 / 0 / +7 / +14 / +21 / +30) con SMS; ofrecer planes de pago
   a deudores de más de 60 días antes que castigarlos; evaluar factoring solo sobre facturas de
   clientes solventes, anualizando siempre el costo.
10. **Inventario:** correr el reporte de SKU sin movimiento y liquidar. El carrying cost de 20–30%
    anual hace que un descuento del 30% sea neutro contra otro año en bodega.
11. **Precio:** identificar SKU de baja elasticidad y aplicar alza selectiva. Calcular el volumen
    máximo tolerable con `−Δp/(MC%+Δp)` para desarmar la objeción interna.
12. **Términos:** en Colombia, invocar por escrito la Ley 2024 de 2020 con los clientes grandes que
    pagan por encima de 45 días.
13. **Estructura:** solo ahora evaluar sale-leaseback y renegociación de arriendo.

**Regla de gobierno de los 30 días:** un solo tablero, un solo responsable, una reunión semanal, y
todas las decisiones — producción, compras, comercial, personal — pasando por el mismo marco de
liquidez de 13 semanas.

---

## 8. Reglas de asesoría para el agente

Cuando el agente pase de calcular a recomendar, se somete a estas reglas:

1. **Primero el dato, después la recomendación.** Ninguna sugerencia sin la cifra que la sustenta y
   el período del que salió.
2. **Cuantificar el impacto.** No "mejora tu cobranza": *"bajar el DSO de 68 a 55 días libera
   $X millones de una vez, calculado sobre tus ventas diarias de los últimos 90 días"*.
3. **Máximo tres recomendaciones por diagnóstico**, ordenadas por caja liberada ÷ esfuerzo. Una
   lista de quince acciones no se ejecuta.
4. **Declarar el supuesto y su fragilidad.** Si la recomendación depende de que un cliente pague,
   decirlo.
5. **Distinguir el nivel de evidencia.** Un [DATO] con muestra y un [CONVENCIÓN] no se presentan
   igual. Nunca presentar un [NO VERIFICADO] como hecho.
6. **No dar consejo de inversión ni recomendar productos financieros específicos por nombre
   comercial.** Explicar el instrumento, su costo y cuándo aplica; la decisión y la elección del
   proveedor son del dueño.
7. **Decir cuándo el problema no es de caja.** Si el diagnóstico apunta a márgenes negativos o a un
   modelo de negocio inviable, decirlo con claridad en lugar de recomendar factoring.
8. **Recordar que no es un asesor licenciado.** El agente aporta análisis y datos; las decisiones
   financieras, tributarias y legales deben validarse con el contador o revisor fiscal.
9. **Nunca cifras inventadas.** Si un dato no está en la base o en el sistema, se pide o se marca
   como faltante.

---

## 9. Qué está verificado y qué no

### Sólidamente verificado [DATO]

- Colchón de caja de PYMES: mediana 27 días, P25 13 días (JPMorgan Chase Institute, n=597.000).
- Capital de trabajo: CCC 37 días EE.UU. / 44,8 días Europa (Hackett Group, n=1.000 cada uno).
- Comportamiento de pago LatAm: plazo 59 días, retraso 42 días, Colombia 50 días (Coface, n>300).
- Solo 14% de los equipos financieros mide la precisión de su pronóstico (AFP 2026).
- Impacto del precio: +1% precio → +8% utilidad operativa (McKinsey, S&P 1500).
- Costo del 2/10 neto 30 = 36,7% E.A. (fórmula estándar).
- Carrying cost de inventario 20–30% anual.
- Probabilidad de cobro por momento del primer contacto: 65% / 45% / 30% / 15%.
- Marco normativo colombiano: UVT 2026, calendario del Decreto 2229/2023, tarifas del Decreto
  572/2025, salario mínimo 2026, fechas de prestaciones, escalonamiento de la Ley 2466/2025,
  Ley 2024 de 2020, NIC 7 párrafos 1, 7, 10, 18-19, clasificación en Grupos 1/2/3.
- Tasas Superfinanciera agosto 2026: IBC 19,77% E.A., usura 29,66% E.A. **[VOLÁTIL]**

### Convención sin muestra estadística [CONVENCIÓN]

- Rangos de razón corriente (1,5–3,0), prueba ácida (≥1,0), razón de efectivo (0,50–1,00).
- Cortes del CEI (70% / 85%).
- Runway objetivo de 6–12 meses.
- Anticipos de 30–50% en servicios y proyectos.
- Provisión laboral de 45%–57% del salario (cálculo derivado, no cifra oficial).

### No verificado — no usar para decidir [NO VERIFICADO]

- **Umbrales de varianza ±5% / ±10% / ±15%**: hay consenso direccional entre tres fuentes
  secundarias, pero ninguna es normativa y no coinciden entre sí. Derívalos de tus propios datos.
- **Tablas de DSO y CCC por industria** de blogs: no citan fuente primaria.
- **Probabilidades de cobro por antigüedad** (80-95% / 50-85% / etc.): ilustrativas. Calibrar con
  historial propio.
- **Tarifas de factoring en Colombia**: no publicadas de forma verificable.
- **Elasticidad-precio para PYMES**: no existe cifra genérica confiable.
- **"82% de las empresas fallan por flujo de caja"**: circula atribuida a US Bank; **el estudio
  primario no existe de forma localizable. No usar.**
- **"88% de las hojas de cálculo tienen al menos un error"**: origen académico (Panko) no
  verificado en esta investigación.
- Tasas finales de las líneas Bancóldex: las fija cada banco intermediario.
- Aportes de pensión (12%/4%) y rango de ARL (0,522%–6,960%): son los valores estándar del sistema
  pero no se verificaron en fuente oficial. Salud y parafiscales sí quedaron confirmados.

### Advertencias de vigencia [VOLÁTIL]

- **IBC y tasa de usura**: la Superfinanciera las certifica mensualmente. Entre febrero y agosto de
  2026 la usura pasó de 25,23% a 29,66% E.A. **Nunca escribir estas cifras en el código.**
- **Decreto 0173 de 2026** (impuesto al patrimonio a personas jurídicas): decreto de emergencia con
  riesgo de caída; existe el precedente del Decreto 1474/2025 declarado inexequible.
- **Decreto 1469/2025** (salario mínimo) y **Decreto 572/2025** (retenciones): ambos vigentes, pero
  con procesos de nulidad de fondo pendientes. Solo se revocaron las medidas cautelares.
- Los datos del colchón de caja del JPMorgan Chase Institute son de **2015**. No hay actualización
  con muestra comparable.
- Los benchmarks de Hackett son de **grandes empresas**. Una PYME normalmente tiene peor CCC.

---

## 10. Fuentes

**Pronóstico y tesorería**
- [Atlar — 13-week cash flow forecast](https://www.atlar.com/learn/what-is-the-13-week-cash-flow-forecast) · [Direct vs indirect forecasting](https://www.atlar.com/learn/what-are-the-direct-and-indirect-forecasting-methods)
- [Abacum — 13 Week Cash Flow Forecast Guide](https://www.abacum.ai/blog/13-week-cash-flow)
- [re:cap — Guide to 13-Week Cash Flow Forecast](https://www.re-cap.com/blog/13-week-cash-flow-forecast)
- [PKF O'Connor Davies — A CFO's Lifeline](https://www.pkfod.com/insights/a-cfos-lifeline-mastering-the-13-week-cash-flow-forecast/)
- [HighRadius — Build a 13 Week Cash Flow Forecast](https://www.highradius.com/resources/Blog/build-13-week-cash-flow-forecast/)
- [Wall Street Prep — 13-Week Cash Flow Model](https://www.wallstreetprep.com/knowledge/demystifying-the-13-week-cash-flow-model-in-excel/) · [Cash Conversion Cycle](https://www.wallstreetprep.com/knowledge/cash-conversion-cycle-ccc/) · [Acid-Test Ratio](https://www.wallstreetprep.com/knowledge/acid-test-ratio/)
- [Numeric — Cash Flow Forecasting Guide 2026](https://www.numeric.io/blog/cash-flow-forecasting-guide)
- [Oracle — Driver-Based Forecasting Methods](https://docs.oracle.com/en/cloud/saas/planning-budgeting-cloud/casha/cash_driver_based_forecast_methods.html)
- [A Faster Exit — 13-Week Cash Flow Forecast](https://afasterexit.com/guides/13-week-cash-flow-forecast/)
- [CE Interim — Crisis CFO and the 13-week forecast](https://ceinterim.com/13-week-cash-flow-forecast-crisis-cfo/)
- [Kyriba — How to Forecast Cash Flow](https://www.kyriba.com/blog/six-questions-how-to-forecast-cash-flow/)
- [Trovata — Cash Forecast Best Practices](https://trovata.io/blog/cash-forecast-best-practices)
- [Farseer — Scenario Planning or Sensitivity Analysis](https://www.farseer.com/blog/scenario-planning-or-sensitivity-analysis/)
- [Phoenix Strategy Group — Scenario Planning for Cash Flow Variability](https://www.phoenixstrategy.group/blog/scenario-planning-for-cash-flow-variability-basics)
- [Intuit Enterprise — Cash Flow Variance Analysis](https://erp.intuit.com/blog/financials/cash-flow-variance-analysis/)
- [CFO Bridge — Types of Variances in Cash Flow Forecasting](https://cfobridge.com/resources/types-of-variances-in-cash-flow-forecasting-how-to-analyze-and-interpret-deviations)
- [Palm — Variance Analysis: A Treasurer's Guide](https://www.usepalm.com/blog/variance-analysis-a-treasurer-s-guide-to-improving-the-cash-forecast)
- [AFP — Your Forecast Does Not Have a Score. It Should.](https://www.financialprofessionals.org/training-resources/resources/articles/Details/your-forecast-does-not-have-a-score-it-should)
- [CTMfile — Treasury cash forecasting: rising expectations](https://ctmfile.com/story/treasury-cash-forecasting-rising-expectations-growing-complexity-ais-promise)
- [Float — Early Warning System for Cash Flow](https://www.floatapp.com/blog/early-warning-system-cash-flow)

**Indicadores y benchmarks**
- [JPMorgan Chase Institute — Cash Flows, Balances, and Buffer Days](https://www.jpmorganchase.com/institute/all-topics/business-growth-and-entrepreneurship/report-cash-flows-balances-and-buffer-days)
- [The Hackett Group — 2025 Working Capital Survey EE.UU.](https://www.thehackettgroup.com/2025-working-capital-survey-payables-rebound-receivables-inventory-lag/) · [Europa](https://www.thehackettgroup.com/2025-europe-working-capital-survey-cash-cycle-deterioration/)
- [Coface — 2025 Latin America Corporate Payment Survey](https://www.coface.com/news-economy-and-insights/2025-latin-america-corporate-payment-survey-longer-payment-terms-and-rising-delays)
- [Credit Research Foundation — Performance Measures (PDF)](https://www.crfonline.org/wp-content/uploads/2017/12/PerformanceMeasures.pdf)
- [Chaser — Collection Effectiveness Index](https://www.chaserhq.com/blog/collection-effectiveness-index)
- [AccountingTools — Cash Flow Ratios](https://www.accountingtools.com/articles/cash-flow-ratios.html)
- [Emagia — Operating Cash Flow Ratio](https://www.emagia.com/resources/glossary/good-operating-cash-flow-ratio/)
- [Allianz Trade — Cash Ratio](https://www.allianz-trade.com/en_US/insights/cash-ratio.html)
- [Corporate Finance Institute — Cash Runway](https://corporatefinanceinstitute.com/resources/valuation/cash-runway-explained/)
- [CreditGuru — Altman Z'' Emerging Markets](https://www.creditguru.com/index.php/bankruptcy-and-insolvency/altman-z-score-insolvency-predictor-for-non-manufacturers-emerging-markets) · [Z' Private Firms](https://www.creditguru.com/index.php/bankruptcy-and-insolvency/altman-z-score-insolvency-predictor-for-private-firms)
- [Eqvista — Quick Ratio by Industry](https://eqvista.com/acid-test-quick-ratio-by-industry/)
- [Umbrex — Working Capital as % of Sales](https://umbrex.com/resources/company-analysis/finance/working-capital-as-percentage-of-sales/)
- [Netstock — Days Inventory Outstanding](https://www.netstock.com/blog/how-to-calculate-and-improve-days-inventory-outstanding-dio/)
- [Nventory — Dead Stock](https://nventory.io/us/glossary/dead-stock)

**Colombia**
- [DIAN — Calendario de obligaciones](https://www.dian.gov.co/Contribuyentes-Plus/Paginas/Calendario-de-obligaciones.aspx)
- [DIAN — Decreto 2229 de 2023](https://normograma.dian.gov.co/dian/compilacion/docs/decreto_2229_2023.htm)
- [DIAN — Decreto 572 de 2025](https://normograma.dian.gov.co/dian/compilacion/docs/decreto_0572_2025.htm)
- [DIAN — Resolución 165 de 2023 (facturación electrónica)](https://normograma.dian.gov.co/dian/compilacion/docs/resolucion_dian_0165_2023.htm)
- [DIAN — RADIAN](https://micrositios.dian.gov.co/sistema-de-facturacion-electronica/radian/)
- [Función Pública — Ley 2466 de 2025 (reforma laboral)](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=260676)
- [SUIN Juriscol — Ley 2024 de 2020 (Pago en Plazos Justos)](https://www.suin-juriscol.gov.co/viewDocument.asp?id=30039609)
- [Superfinanciera — Interés Bancario Corriente](https://www.superfinanciera.gov.co/publicaciones/10115999/superfinanciera-certifica-el-interes-bancario-corriente/)
- [Portafolio — Tasa de usura agosto 2026](https://www.portafolio.co/economia/finanzas/superfinanciera-fijo-la-tasa-de-usura-en-29-66-estas-son-las-deudas-que-mas-se-encarecen-499499)
- [Banco de la República — Reporte de la situación del crédito, junio 2026](https://www.banrep.gov.co/es/publicaciones-investigaciones/reporte-situacion-credito-colombia/junio-2026)
- [Bancóldex — Líneas de crédito](https://www.bancoldex.com/lineas-de-credito)
- [Bancolombia — Confirming](https://www.bancolombia.com/negocios/productos/financiacion/factoring/confirming) · [Ley de pago a plazos justos](https://blog.bancolombia.com/negocios/ley-de-pago-a-plazos-justos/)
- [Holland & Knight — Salario mínimo 2026](https://www.hklaw.com/en/insights/publications/2025/12/colombia-decreta-aumento-del-salario-minimo-y-auxilio-de-transporte) · [Impuesto al patrimonio personas jurídicas](https://www.hklaw.com/en/insights/publications/2026/02/nuevo-impuesto-al-patrimonio-para-personas-juridicas-en-colombia)
- [BDO — Decreto 0173 de 2026](https://www.bdo.com.co/es-co/publicaciones/boletines-tax/tax-alert-decreto-de-emergencia-economica-0173-de-2026)
- [INCP — UVT 2026](https://incp.org.co/publicaciones/infoincp-publicaciones/impuestos/2025/12/dian-fijo-en-52-374-en-valor-de-la-uvt-para-el-ano-gravable-2026/)
- [Accounter/CTCP — Concepto 210 de 2025 (clasificación de grupos)](https://accounter.co/normatividad/clasificacion-de-entidades-y-marcos-normativos-dur-2420-de-2015-concepto-210-ctcp-de-2025)
- [actualicese — GMF 2026](https://actualicese.com/transacciones-exentas-del-gmf-en-2026/) · [Exonerados de parafiscales 2026](https://actualicese.com/exonerados-de-aportes-parafiscales-en-2026/)
- [Gerencie — Prestaciones sociales](https://www.gerencie.com/porcentajes-prestaciones-sociales.html) · [Grupos contables](https://www.gerencie.com/grupos-en-contabilidad.html)
- [Siempre al Día — Indicadores de liquidez](https://siemprealdia.co/colombia/finanzas/indicadores-de-liquidez/) · [Retención en la fuente 2026](https://siemprealdia.co/colombia/impuestos/tabla-de-retencion-en-la-fuente-2026/) · [Calendario Bogotá 2026](https://siemprealdia.co/colombia/impuestos/calendario-tributario-distrital-de-bogota/)
- [IFRS — NIC 7 texto oficial (PDF)](https://www.mef.gob.pe/contenidos/conta_publ/con_nor_co/niif/NIC_7_BV2022_GVT.pdf)
- [Supersociedades — Informe PYMES Colombia 2025](https://www.supersociedades.gov.co/en/web/asuntos-economicos-societarios/sectores-economicos/-/asset_publisher/hkek/content/informe-relacionado-con-el-comportamiento-financiero-y-econ%C3%B3mico-de-las-pymes-en-colombia-2025)

**Palancas y tácticas**
- [Tipalti — 2/10 Net 30](https://tipalti.com/resources/learn/210-net-30/)
- [Yonovo — Invoice Reminder Best Practices](https://www.yonovo.com/blog/invoice-reminder-best-practices)
- [CreditPulse — DSO Benchmarks](https://www.creditpulse.com/blog/days-sales-outstanding-dso-by-industry-2025-benchmarks-data-analysis) *(marcado como no verificado)*
- [Crestmont Capital — Invoice Factoring Rates](https://www.crestmontcapital.com/blog/invoice-factoring-rates)
- [United Capital Source — Invoice Factoring Costs](https://www.unitedcapitalsource.com/blog/invoice-factoring-costs/)
- [Bankrate — Business Line of Credit Rates](https://www.bankrate.com/loans/small-business/average-business-line-of-credit-rates)
- [McKinsey — The Power of Pricing](https://www.mckinsey.com/capabilities/growth-marketing-and-sales/our-insights/the-power-of-pricing)
- [debt.org — Prioritizing Your Bills](https://www.debt.org/small-business/prioritizing-your-bills/)
- [The Cauble Group — Sale-Leaseback](https://www.tylercauble.com/blog/what-is-a-sale-leaseback-transaction)
- [Patriot Software — Creating a Credit Policy](https://www.patriotsoftware.com/blog/accounting/creating-credit-policy-small-business/)
- [Mesfix — Factoring en Colombia](https://mesfix.com/blog/emprendimiento/factoring-para-empresas-en-colombia/)
