import Anthropic from '@anthropic-ai/sdk'
import { formatCOP, hoyBogota } from '@/lib/utils/format'
import {
  consultarCartera,
  consultarComprasRecientes,
  consultarGastos,
  consultarSaldos,
  consultarStock,
  consultarVentas,
  type Periodo,
} from './consultas'

// Asistente de WhatsApp de Tres Bandas: SOLO consulta. Con ANTHROPIC_API_KEY
// entiende preguntas libres (la IA elige qué consulta usar y redacta la
// respuesta con las cifras que devuelve el sistema). Sin la clave responde por
// palabras clave.

const MODELO = process.env.WHATSAPP_MODELO || 'claude-haiku-4-5-20251001'
const MAX_VUELTAS = 5

const PERIODOS = ['hoy', 'ayer', 'semana', 'mes', 'mes_pasado', 'rango'] as const
const PROP_SEDE = {
  sede: { type: 'string', description: 'Sede (opcional): Bucaramanga (TR), Cúcuta (CR) o Santa Rosa (SR). Sin sede = todas.' },
} as const
const PROP_PERIODO = {
  periodo: { type: 'string', enum: [...PERIODOS], description: "Período a consultar. 'semana' = últimos 7 días. 'rango' usa desde y hasta." },
  desde: { type: 'string', description: "Solo con periodo 'rango': fecha inicial YYYY-MM-DD" },
  hasta: { type: 'string', description: "Solo con periodo 'rango': fecha final YYYY-MM-DD" },
  ...PROP_SEDE,
} as const

const HERRAMIENTAS: Anthropic.Tool[] = [
  {
    name: 'ventas',
    description: 'Total vendido, número de ventas y ticket promedio en un período, total y por sede.',
    input_schema: { type: 'object', properties: PROP_PERIODO, required: ['periodo'] },
  },
  {
    name: 'gastos',
    description: 'Total de gastos del negocio en un período, por categoría y por sede.',
    input_schema: { type: 'object', properties: PROP_PERIODO, required: ['periodo'] },
  },
  {
    name: 'stock',
    description: 'Unidades disponibles por talla y por sede de los artículos que coincidan con un nombre, marca o código.',
    input_schema: {
      type: 'object',
      properties: { busqueda: { type: 'string', description: 'Nombre, marca o código del artículo' }, ...PROP_SEDE },
      required: ['busqueda'],
    },
  },
  {
    name: 'cartera',
    description: 'Lo que los clientes deben (cartera). Sin búsqueda: total y mayores deudores. Con búsqueda: lo que debe ese cliente.',
    input_schema: {
      type: 'object',
      properties: { busqueda: { type: 'string', description: 'Nombre, teléfono o cédula del cliente (opcional)' } },
    },
  },
  {
    name: 'saldos_cuentas',
    description: 'Saldo actual de cada cuenta (efectivo, bancos, Nequi, etc.) y el total disponible; aparte, lo que hay por cobrar en Addi/Sistecrédito.',
    input_schema: { type: 'object', properties: { ...PROP_SEDE } },
  },
  {
    name: 'compras_recientes',
    description: 'Últimas compras a proveedores registradas, con su valor.',
    input_schema: { type: 'object', properties: { cantidad: { type: 'number', description: 'Cuántas mostrar (por defecto 5)' } } },
  },
]

async function ejecutar(nombre: string, entrada: Record<string, unknown>): Promise<unknown> {
  const sede = entrada.sede ? String(entrada.sede) : undefined
  try {
    switch (nombre) {
      case 'ventas':
        return await consultarVentas(entrada.periodo as Periodo, entrada.desde as string, entrada.hasta as string, sede)
      case 'gastos':
        return await consultarGastos(entrada.periodo as Periodo, entrada.desde as string, entrada.hasta as string, sede)
      case 'stock':
        return await consultarStock(String(entrada.busqueda ?? ''), sede)
      case 'cartera':
        return await consultarCartera(entrada.busqueda ? String(entrada.busqueda) : undefined)
      case 'saldos_cuentas':
        return await consultarSaldos(sede)
      case 'compras_recientes':
        return await consultarComprasRecientes(Number(entrada.cantidad) || 5)
      default:
        return { error: 'Consulta no disponible' }
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Error consultando' }
  }
}

const AYUDA =
  'Hola, soy el asistente de Tres Bandas. Puedes preguntarme por ejemplo:\n' +
  '• ventas de hoy / de ayer / de la semana / del mes (y por sede: "ventas de Santa Rosa")\n' +
  '• gastos del mes\n' +
  '• cuánto hay de [artículo o marca]\n' +
  '• cartera / cuánto debe [cliente]\n' +
  '• saldos de las cuentas\n' +
  '• últimas compras'

export async function responder(pregunta: string): Promise<string> {
  const texto = pregunta.trim().slice(0, 500)
  if (!texto) return AYUDA
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await responderConIA(texto)
    } catch (e) {
      console.error('[whatsapp] IA falló, se responde por palabras clave:', e)
    }
  }
  return responderPorPalabras(texto)
}

async function responderConIA(pregunta: string): Promise<string> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const sistema =
    'Eres el asistente de WhatsApp de Tres Bandas, una tienda de ropa y tenis en Colombia con tres sedes: ' +
    'Bucaramanga (TR, la principal), Cúcuta (CR) y Santa Rosa (SR). ' +
    `Hoy es ${hoyBogota()} (hora Bogotá). El dueño te hace preguntas sobre su negocio. ` +
    'Responde SIEMPRE en español, corto y claro, como un mensaje de WhatsApp (puedes usar *negrita* y listas con •). ' +
    'Usa únicamente las herramientas para obtener cifras y nunca inventes ni estimes datos. ' +
    'Los valores en pesos escríbelos con puntos de miles, por ejemplo $1.250.000. ' +
    'Las ventas incluyen pedidos por encargo y ventas de tienda; el total vendido es la suma de los pedidos, no de las facturas. ' +
    'El saldo de Addi y Sistecrédito es plata por cobrar, no disponible: no lo sumes al dinero disponible. ' +
    'Solo puedes consultar información; si te piden registrar, cambiar o borrar algo, di que por ahora eso se hace en la página. ' +
    'Si la pregunta no tiene que ver con el negocio, di amablemente qué puedes consultar.'

  const mensajes: Anthropic.MessageParam[] = [{ role: 'user', content: pregunta }]
  for (let i = 0; i < MAX_VUELTAS; i++) {
    const r = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 800,
      system: sistema,
      tools: HERRAMIENTAS,
      messages: mensajes,
    })
    const usos = r.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    if (usos.length === 0) {
      const t = r.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('\n')
        .trim()
      return t || AYUDA
    }
    mensajes.push({ role: 'assistant', content: r.content })
    const resultados: Anthropic.ToolResultBlockParam[] = []
    for (const u of usos) {
      resultados.push({
        type: 'tool_result',
        tool_use_id: u.id,
        content: JSON.stringify(await ejecutar(u.name, (u.input ?? {}) as Record<string, unknown>)),
      })
    }
    mensajes.push({ role: 'user', content: resultados })
  }
  return 'No pude armar la respuesta. Intenta con una pregunta más corta.'
}

// ── Sin IA: reconoce palabras clave y arma el texto directamente ─────────────
function sinTildes(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function periodoDe(t: string): Periodo {
  if (/ayer/.test(t)) return 'ayer'
  if (/mes pasado/.test(t)) return 'mes_pasado'
  if (/semana/.test(t)) return 'semana'
  if (/\bmes\b/.test(t)) return 'mes'
  return 'hoy'
}

function sedeDe(t: string): string | undefined {
  if (/bucaramanga|\btr\b/.test(t)) return 'TR'
  if (/santa rosa|\bsr\b/.test(t)) return 'SR'
  if (/cucuta|\bcr\b/.test(t)) return 'CR'
  return undefined
}

async function responderPorPalabras(original: string): Promise<string> {
  const t = sinTildes(original)
  const sede = sedeDe(t)

  if (/\b(venta|ventas|vendi|vendimos|vendido)\b/.test(t)) {
    const r = await consultarVentas(periodoDe(t), undefined, undefined, sede) as Record<string, unknown>
    if ('error' in r) return 'No pude consultar las ventas en este momento.'
    const porSede = Object.entries(r.por_sede as Record<string, { ventas: number; total_cop: number }>)
      .map(([n, v]) => `• ${n}: ${formatCOP(v.total_cop)} (${v.ventas})`).join('\n')
    return `*Ventas de ${r.periodo}* (${r.sede})\n• Total: ${formatCOP(Number(r.total_vendido_cop))}\n• Número de ventas: ${r.numero_de_ventas}\n• Ticket promedio: ${formatCOP(Number(r.ticket_promedio_cop))}${porSede ? '\n' + porSede : ''}`
  }
  if (/\bgasto|gastos\b/.test(t)) {
    const r = await consultarGastos(periodoDe(t), undefined, undefined, sede) as Record<string, unknown>
    if ('error' in r) return 'No pude consultar los gastos en este momento.'
    const cats = Object.entries(r.por_categoria_cop as Record<string, number>)
      .map(([c, v]) => `• ${c}: ${formatCOP(v)}`).join('\n')
    return `*Gastos de ${r.periodo}* (${r.sede}): ${formatCOP(Number(r.total_gastos_cop))}${cats ? '\n' + cats : ''}`
  }
  if (/\b(saldo|saldos|cuentas|caja|bancos?)\b/.test(t)) {
    const r = await consultarSaldos(sede) as { error?: string; cuentas_disponibles?: Array<{ cuenta: string; saldo_cop: number }>; total_disponible_cop?: number; por_cobrar_financieras?: Array<{ cuenta: string; saldo_cop: number }>; total_por_cobrar_cop?: number }
    if (r.error || !r.cuentas_disponibles) return 'No pude consultar los saldos en este momento.'
    const cobrar = r.por_cobrar_financieras?.length
      ? `\n\n*Por cobrar (financieras)*\n${r.por_cobrar_financieras.map(c => `• ${c.cuenta}: ${formatCOP(c.saldo_cop)}`).join('\n')}\nTotal por cobrar: ${formatCOP(r.total_por_cobrar_cop ?? 0)}`
      : ''
    return `*Saldos*\n${r.cuentas_disponibles.map(c => `• ${c.cuenta}: ${formatCOP(c.saldo_cop)}`).join('\n')}\n*Total disponible: ${formatCOP(r.total_disponible_cop ?? 0)}*${cobrar}`
  }
  if (/\b(compra|compras)\b/.test(t)) {
    const r = await consultarComprasRecientes(5) as { error?: string; compras?: Array<{ proveedor: string; fecha: string; total_cop: number }> }
    if (r.error || !r.compras) return 'No pude consultar las compras en este momento.'
    if (r.compras.length === 0) return 'Todavía no hay compras registradas.'
    return `*Últimas compras*\n${r.compras.map(c => `• ${c.fecha} · ${c.proveedor}: ${formatCOP(c.total_cop)}`).join('\n')}`
  }
  if (/\b(cartera|debe|deben|deuda|deudas|fiado)\b/.test(t)) {
    const cliente = original.replace(/.*\b(debe|deben)\b/i, '').replace(/[?¿.!]/g, '').trim()
    const r = await consultarCartera(/\bdebe\b/.test(t) && cliente ? cliente : undefined) as Record<string, unknown>
    if ('error' in r) return 'No pude consultar la cartera en este momento.'
    const lista = ((r.resultado_busqueda ?? r.mayores_deudores) as Array<{ nombre: string; debe_cop: number }>)
      .map(c => `• ${c.nombre}: ${formatCOP(c.debe_cop)}`).join('\n')
    return `*Cartera*: ${formatCOP(Number(r.cartera_total_cop))} (${r.clientes_con_deuda} clientes)\n${lista}`
  }
  const m = original.match(/(?:hay|queda|quedan|stock|inventario|tenemos)\s+(?:de\s+|del\s+|la\s+|el\s+)?(.+)/i)
  if (m) {
    const termino = m[1].replace(/\b(en|de)\s+(bucaramanga|santa rosa|cucuta|cúcuta)\b/gi, '').replace(/[?¿.!]/g, '').trim()
    const r = await consultarStock(termino, sede) as { error?: string; articulos_con_stock?: Array<{ nombre: string; marca: string; talla: string; unidades_total: number; por_sede: Record<string, number> }> }
    if (r.error || !r.articulos_con_stock) return 'No pude consultar el inventario en este momento.'
    if (r.articulos_con_stock.length === 0) return 'No encontré ese artículo con existencias.'
    return `*Inventario*\n${r.articulos_con_stock.map(p => `• ${p.nombre} (${p.marca}) talla ${p.talla}: ${p.unidades_total}${Object.keys(p.por_sede).length > 1 ? ' — ' + Object.entries(p.por_sede).map(([s, u]) => `${s} ${u}`).join(', ') : ''}`).join('\n')}`
  }
  return AYUDA
}
