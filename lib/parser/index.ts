import { MetodoPago, ParsedPedido, ParseResult } from '@/types'
import { normalizarTelefono } from '@/lib/utils/phone'

// ── Formato estructurado (===INICIO_PEDIDO===) ────────────────────────────────

const SEDES_VALIDAS = ['TR', 'CR', 'SR'] as const
const METODOS_PAGO: MetodoPago[] = ['efectivo', 'transferencia', 'datafono', 'addi', 'bold', 'sistecredito', 'credito', 'otro']
const VERSION_SOPORTADA = '1'

function extractField(lines: string[], key: string): string | null {
  const line = lines.find((l) => l.trim().startsWith(`${key}:`))
  if (!line) return null
  const val = line.slice(line.indexOf(':') + 1).trim()
  return val || null
}

function parseProductos(lines: string[]): ParsedPedido['productos'] | { error: string } {
  const startIdx = lines.findIndex((l) => l.trim() === 'PRODUCTOS:')
  if (startIdx === -1) return { error: 'Falta sección PRODUCTOS:' }

  const productos: ParsedPedido['productos'] = []

  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line.startsWith('-')) continue

    const content = line.slice(1).trim()
    const parts: Record<string, string> = {}

    content.split('|').forEach((seg) => {
      const idx = seg.indexOf(':')
      if (idx === -1) return
      const k = seg.slice(0, idx).trim()
      const v = seg.slice(idx + 1).trim()
      parts[k] = v
    })

    const requiredKeys = ['MARCA', 'DESC', 'CANT', 'PRECIO_VENTA']
    for (const k of requiredKeys) {
      if (!parts[k]) return { error: `Producto sin campo ${k}: "${line}"` }
    }

    const cant = parseInt(parts['CANT'], 10)
    const precio = parseInt(parts['PRECIO_VENTA'].replace(/\D/g, ''), 10)

    if (isNaN(cant) || cant <= 0) return { error: `CANT inválida en producto: "${line}"` }
    if (isNaN(precio) || precio < 0) return { error: `PRECIO_VENTA inválido en producto: "${line}"` }

    productos.push({
      marca: parts['MARCA'],
      descripcion: parts['DESC'],
      talla: parts['TALLA'] ?? null,
      cantidad: cant,
      precio_venta: precio,
    })
  }

  if (productos.length === 0) return { error: 'El pedido debe tener al menos un producto' }
  return productos
}

function parsearEstructurado(texto: string): ParseResult {
  const inicioIdx = texto.indexOf('===INICIO_PEDIDO===')
  const finIdx = texto.indexOf('===FIN_PEDIDO===')

  if (inicioIdx === -1) return { ok: false, error: 'Falta marcador ===INICIO_PEDIDO===' }
  if (finIdx === -1) return { ok: false, error: 'Falta marcador ===FIN_PEDIDO===' }
  if (finIdx < inicioIdx) return { ok: false, error: 'Marcadores en orden incorrecto' }

  const bloque = texto.slice(inicioIdx + '===INICIO_PEDIDO==='.length, finIdx)
  const lines = bloque.split('\n').filter((l) => l.trim() !== '')

  const version = extractField(lines, 'FORMATO_VERSION')
  if (!version) return { ok: false, error: 'Falta campo FORMATO_VERSION' }
  if (version !== VERSION_SOPORTADA)
    return { ok: false, error: `Versión de formato "${version}" no soportada. Versión actual: ${VERSION_SOPORTADA}` }

  const sedeRaw = extractField(lines, 'SEDE')
  if (!sedeRaw) return { ok: false, error: 'Falta campo SEDE' }
  if (!SEDES_VALIDAS.includes(sedeRaw as (typeof SEDES_VALIDAS)[number]))
    return { ok: false, error: `SEDE "${sedeRaw}" no válida. Válidas: ${SEDES_VALIDAS.join(', ')}` }

  const asesor = extractField(lines, 'ASESOR')
  if (!asesor) return { ok: false, error: 'Falta campo ASESOR' }

  const clienteNombre = extractField(lines, 'CLIENTE_NOMBRE')
  if (!clienteNombre) return { ok: false, error: 'Falta campo CLIENTE_NOMBRE' }

  const telefonoRaw = extractField(lines, 'CLIENTE_TELEFONO')
  if (!telefonoRaw) return { ok: false, error: 'Falta campo CLIENTE_TELEFONO' }
  const telefonoNormalizado = normalizarTelefono(telefonoRaw)
  if (!telefonoNormalizado)
    return { ok: false, error: `CLIENTE_TELEFONO "${telefonoRaw}" no es un número colombiano válido` }

  const clienteDoc = extractField(lines, 'CLIENTE_DOC')

  const productosResult = parseProductos(lines)
  if ('error' in productosResult) return { ok: false, error: productosResult.error }

  const totalRaw = extractField(lines, 'TOTAL')
  if (!totalRaw) return { ok: false, error: 'Falta campo TOTAL' }
  const total = parseInt(totalRaw.replace(/\D/g, ''), 10)
  if (isNaN(total) || total < 0) return { ok: false, error: `TOTAL "${totalRaw}" inválido` }

  const sumaProductos = productosResult.reduce((acc, p) => acc + p.precio_venta * p.cantidad, 0)
  if (sumaProductos !== total)
    return {
      ok: false,
      error: `La suma de productos (${sumaProductos}) no coincide con TOTAL (${total}). Revisa el resumen.`,
    }

  const abonoRaw = extractField(lines, 'ABONO') ?? '0'
  const abono = parseInt(abonoRaw.replace(/\D/g, ''), 10)
  if (isNaN(abono) || abono < 0) return { ok: false, error: `ABONO "${abonoRaw}" inválido` }
  if (abono > total) return { ok: false, error: `ABONO (${abono}) no puede ser mayor que TOTAL (${total})` }

  const metodoPagoRaw = (extractField(lines, 'METODO_PAGO_ABONO') ?? 'efectivo').toLowerCase()
  const metodoPago = METODOS_PAGO.find((m) => m === metodoPagoRaw) ?? 'otro'

  const entregaRaw = (extractField(lines, 'ENTREGA') ?? 'sede').toLowerCase()
  const tipoEntrega: 'domicilio' | 'sede' = entregaRaw === 'domicilio' ? 'domicilio' : 'sede'

  const direccion = tipoEntrega === 'domicilio' ? extractField(lines, 'DIRECCION') : null
  if (tipoEntrega === 'domicilio' && !direccion)
    return { ok: false, error: 'ENTREGA es "Domicilio" pero falta el campo DIRECCION' }

  const notasRaw = extractField(lines, 'NOTAS')
  const notas = notasRaw === 'ninguna' || notasRaw === 'none' || notasRaw === '-' ? null : notasRaw

  return {
    ok: true,
    data: {
      formato_version: version,
      sede: sedeRaw as 'TR' | 'CR' | 'SR',
      asesor,
      cliente_nombre: clienteNombre,
      cliente_doc: clienteDoc,
      cliente_telefono: telefonoNormalizado,
      productos: productosResult,
      total,
      abono,
      metodo_pago_abono: metodoPago,
      tipo_entrega: tipoEntrega,
      direccion,
      notas,
    },
  }
}

// ── Formato libre (WhatsApp) ──────────────────────────────────────────────────

const SEDE_POR_CIUDAD: Record<string, 'TR' | 'CR' | 'SR'> = {
  bucaramanga: 'TR',
  cucuta: 'CR',
  cúcuta: 'CR',
  'santa rosa': 'SR',
}

const MARCA_POR_DOMINIO: Record<string, string> = {
  'newbalance.com': 'New Balance',
  'nike.com': 'Nike',
  'adidas.com': 'Adidas',
  'jordan.com': 'Jordan',
  'puma.com': 'Puma',
  'vans.com': 'Vans',
  'converse.com': 'Converse',
  'reebok.com': 'Reebok',
  'skechers.com': 'Skechers',
  'underarmour.com': 'Under Armour',
  'timberland.com': 'Timberland',
  'crocs.com': 'Crocs',
  'fila.com': 'Fila',
  'lacoste.com': 'Lacoste',
  'calvinklein.com': 'Calvin Klein',
  'tommy.com': 'Tommy Hilfiger',
  'tommyhilfiger.com': 'Tommy Hilfiger',
  'levi.com': 'Levi\'s',
  'levis.com': 'Levi\'s',
  'ralphlauren.com': 'Ralph Lauren',
  'michaelkors.com': 'Michael Kors',
  'coach.com': 'Coach',
  'gucci.com': 'Gucci',
}

function marcaDesdeUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace('www.', '')
    return MARCA_POR_DOMINIO[host] ?? ''
  } catch {
    return ''
  }
}

function descDesdeUrl(url: string): string {
  try {
    const u = new URL(url)
    // Buscar parámetro de estilo (ej. dwvar_..._style=MR530SG)
    for (const [key, value] of u.searchParams.entries()) {
      if (key.toLowerCase().includes('style') || key.toLowerCase().includes('color')) return value
    }
    // Usar último segmento del path sin extensión
    const segmentos = u.pathname.split('/').filter(Boolean)
    const ultimo = segmentos[segmentos.length - 1]?.replace(/\.(html?|php|aspx)$/i, '')
    if (ultimo && ultimo.length > 1) return ultimo
    return u.pathname
  } catch {
    return url
  }
}

// Parsear expresiones de precio como "$354.000 + $310.000 = $664.000"
function parsearPreciosExpresion(raw: string): { individuales: number[], total: number | null } {
  const sinDolar = raw.replace(/\$/g, '')
  const partes   = sinDolar.split('=')
  const sumaStr  = partes[0]
  const totalStr = partes.length > 1 ? partes[partes.length - 1] : null

  const individuales = sumaStr.split('+').map(p =>
    parseInt(p.replace(/\./g, '').replace(/[^\d]/g, ''), 10)
  ).filter(n => !isNaN(n) && n > 0)

  const total = totalStr
    ? parseInt(totalStr.replace(/\./g, '').replace(/[^\d]/g, ''), 10) || null
    : null

  return { individuales, total }
}

function detectarMetodo(texto: string): MetodoPago {
  const n = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (/bancolombia|nequi|daviplata|transferencia|pse|consignacion/.test(n)) return 'transferencia'
  if (/datafono|tarjeta/.test(n)) return 'datafono'
  if (/addi/.test(n)) return 'addi'
  if (/bold/.test(n)) return 'bold'
  if (/sistecredito|siste/.test(n)) return 'sistecredito'
  if (/credito/.test(n)) return 'credito'
  if (/efectivo|cash/.test(n)) return 'efectivo'
  return 'otro'
}

function parseMontoMetodo(texto: string): { monto: number; metodo: MetodoPago } {
  const numStr = texto.match(/[\d.,´']+/)?.[0] ?? '0'
  const monto = parseInt(numStr.replace(/[.,´']/g, ''), 10) || 0
  return { monto, metodo: detectarMetodo(texto) }
}

// Normaliza una cadena: quita tildes/diacríticos, pasa a minúsculas, colapsa espacios
function nc(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

// Extrae el valor de una línea dado un conjunto de claves.
// Acepta tanto "Clave: valor" como "Clave valor" (sin dos puntos).
function splitKeyVal(line: string, normKeys: string[]): string | null {
  const ci = line.indexOf(':')
  if (ci !== -1) {
    if (normKeys.includes(nc(line.slice(0, ci)))) {
      return line.slice(ci + 1).trim() || null
    }
    return null
  }
  // Sin dos puntos: busca si la línea empieza con alguna clave conocida
  const lineNc = nc(line)
  for (const nk of normKeys) {
    if (lineNc.startsWith(nk + ' ') || lineNc === nk) {
      const nkWordCount = nk.split(' ').length
      const val = line.trim().split(/\s+/).slice(nkWordCount).join(' ').trim()
      return val || null
    }
  }
  return null
}

function findRaw(lines: string[], ...claves: string[]): string | null {
  const norm = claves.map(nc)
  for (const line of lines) {
    const val = splitKeyVal(line, norm)
    if (val !== null) return val
  }
  return null
}

// Igual que findRaw pero devuelve TODOS los valores que coincidan (para campos repetidos)
function collectAll(lines: string[], ...claves: string[]): string[] {
  const norm = claves.map(nc)
  const results: string[] = []
  for (const line of lines) {
    const val = splitKeyVal(line, norm)
    if (val !== null) results.push(val)
  }
  return results
}

// Detecta líneas que parecen una dirección colombiana (Calle, Carrera, Av, etc.)
function esDireccion(line: string): boolean {
  if (/^(calle|carrera|cra|cl|avenida|av|autopista|transversal|trans|tv|diagonal|diag|dg)\b/i.test(line.trim())) return true
  if (/#\s*\d+[a-zA-Z]?\s*-\s*\d+/.test(line)) return true
  return false
}

function parsearLibre(texto: string): ParseResult {
  const lines = texto.split('\n').map((l) => l.trim()).filter(Boolean)

  // ── Número de pedido (obligatorio — define la sede) ───────────────────────
  const numeroCampo = findRaw(lines, 'Número de pedido', 'N° Pedido', 'No de Pedido', 'No. Pedido', 'Pedido', 'Orden')
  const ordenSuelto = lines.find(l => /^(TR|CR|SR)\d+$/i.test(l))
  const numeroPedido = numeroCampo ?? ordenSuelto ?? null
  if (!numeroPedido) return { ok: false, error: 'Falta el número de pedido (ej. TR5946). Debe empezar con TR, CR o SR.' }
  const numeroOrden = numeroPedido.trim().toUpperCase()

  const prefijo = numeroOrden.slice(0, 2) as 'TR' | 'CR' | 'SR'
  if (!SEDES_VALIDAS.includes(prefijo))
    return { ok: false, error: `El número de pedido "${numeroOrden}" debe empezar con TR (Bucaramanga), CR (Cúcuta) o SR (Santa Rosa).` }
  const sede = prefijo

  const advertencias: string[] = []

  // ── Teléfono (etiquetado o patrón colombiano suelto) ─────────────────────
  let telefonoRaw = findRaw(lines, 'Celular', 'Teléfono', 'Tel', 'Cel', 'Whatsapp')
  if (!telefonoRaw) {
    for (const line of lines) {
      const cleaned = line.replace(/[\s\-().+]/g, '')
      if (/^(57)?3\d{9}$/.test(cleaned)) { telefonoRaw = cleaned.replace(/^57/, ''); break }
    }
  }
  let telefono = ''
  if (telefonoRaw) {
    telefono = normalizarTelefono(telefonoRaw) ?? telefonoRaw
  } else {
    advertencias.push('Celular')
  }

  // ── Nombre (etiquetado o primera línea multi-palabra con mayúsculas) ──────
  let clienteNombre = findRaw(lines, 'Nombre', 'Cliente', 'Nombre del cliente')
  if (!clienteNombre) {
    const phoneStr = telefonoRaw?.replace(/\D/g, '') ?? ''
    for (const line of lines) {
      if (line.includes(':')) continue
      if (/^(TR|CR|SR)\d+/i.test(line)) continue
      if (/\d{7,}/.test(line.replace(/\s/g, ''))) continue  // cédula / número largo
      if (phoneStr && line.replace(/\D/g, '') === phoneStr) continue
      const palabras = line.trim().split(/\s+/)
      if (palabras.length < 2) continue                      // una sola palabra
      if (line.length < 4 || line.length > 60) continue
      // Preferir líneas con al menos una palabra en mayúscula (nombres propios)
      const tieneMayuscula = palabras.some(w => /^[A-ZÁÉÍÓÚÑÜ]/.test(w))
      if (!tieneMayuscula) continue
      clienteNombre = line; break
    }
    // Último recurso: primera línea multi-palabra aunque sea todo minúscula
    if (!clienteNombre) {
      const phoneStr2 = telefonoRaw?.replace(/\D/g, '') ?? ''
      for (const line of lines) {
        if (line.includes(':')) continue
        if (/^(TR|CR|SR)\d+/i.test(line)) continue
        if (/\d{7,}/.test(line.replace(/\s/g, ''))) continue
        if (phoneStr2 && line.replace(/\D/g, '') === phoneStr2) continue
        if (line.trim().split(/\s+/).length < 2) continue
        if (line.length < 4 || line.length > 60) continue
        clienteNombre = line; break
      }
    }
  }
  if (!clienteNombre) advertencias.push('Nombre')

  // ── Artículos: detección de líneas "[artículo] talla [X]" (un producto por línea) ──
  // Ej: "top talla S", "Sudadera talla M 150.000", "Tenis talla 7"
  const lineasConTalla: Array<{ descripcion: string; talla: string; precioEmbebido: number | null }> = []
  for (const line of lines) {
    if (line.includes(':')) continue
    const m = line.match(/^(.+?)\s+talla\s+([^\s,]+)(?:\s+\$?([\d.,´']+))?$/i)
    if (!m) continue
    const desc = m[1].trim()
    if (/^(nombre|celular|tel|cel|precio|abono|asesor|pedido|n[°o]|total|metodo|entrega|ciudad|barrio)/i.test(desc)) continue
    if (/^(TR|CR|SR)\d+/i.test(desc)) continue
    const talla = m[2].trim()
    const precioEmbebido = m[3] ? (parseInt(m[3].replace(/[.,´']/g, ''), 10) || null) : null
    lineasConTalla.push({ descripcion: desc, talla, precioEmbebido })
  }

  // ── Artículos (etiquetados, links, o líneas huérfanas de descripción) ─────
  const articuloKeysNorm = ['articulo/link', 'articulo', 'codigo de producto', 'codigo', 'producto', 'prenda', 'ref', 'referencia', 'link', 'url']
  const todosArticulos: string[] = []
  for (const line of lines) {
    const ci = line.indexOf(':')
    let matched = false
    if (ci !== -1 && articuloKeysNorm.includes(nc(line.slice(0, ci)))) {
      const val = line.slice(ci + 1).trim()
      if (val) { todosArticulos.push(val); matched = true }
    }
    if (!matched && /^https?:\/\//i.test(line)) todosArticulos.push(line.trim())
  }
  // Fallback: líneas huérfanas que parecen descripción de artículo
  if (todosArticulos.length === 0) {
    const nombreNc = clienteNombre ? nc(clienteNombre) : ''
    const phoneStr = telefonoRaw?.replace(/\D/g, '') ?? ''
    // Palabras clave que indican que la línea ya fue (o será) consumida por otro campo
    const camposOcupados = ['talla', 'abono', 'anticipo', 'adelanto', 'precio', 'valor', 'costo', 'valo', 'val', 'vlr', 'cc', 'cedula', 'documento', 'doc', 'notas', 'nota', 'observaciones', 'ciudad', 'barrio', 'asesor', 'vendedor', 'pago', 'metodo', 'entrega', 'direccion', 'dir', 'separado']
    for (const line of lines) {
      if (line.includes(':')) continue
      if (/^https?:\/\//i.test(line)) continue
      if (/^(TR|CR|SR)\d+/i.test(line)) continue
      if (/\d{7,}/.test(line.replace(/\s/g, ''))) continue
      if (phoneStr && line.replace(/\D/g, '') === phoneStr) continue
      if (nombreNc && nc(line) === nombreNc) continue         // ya tomado como nombre
      if (line.trim().split(/\s+/).length < 2) continue       // una sola palabra
      if (esDireccion(line)) continue                         // dirección de entrega, no producto
      const lineNc = nc(line)
      if (camposOcupados.some(k => lineNc === k || lineNc.startsWith(k + ' '))) continue
      todosArticulos.push(line.trim()); break
    }
  }

  // ── Talla ─────────────────────────────────────────────────────────────────
  const todasTallasRaw = collectAll(lines, 'Talla')
  const todasTallas = todasTallasRaw.flatMap(t => t.split(/\s*\/\s*/).map(s => s.trim()).filter(Boolean))

  // ── Precios (etiquetados con alias comunes) ───────────────────────────────
  const todosPrecios = collectAll(lines, 'Precio', 'Valor', 'Costo', 'Valo', 'Val', 'Vlr', 'Precio venta', 'Precio de venta')

  const todosAbonos  = collectAll(lines, 'Abono', 'Anticipo', 'Adelanto', 'Cuota inicial', 'Separado')

  let asesorRaw = findRaw(lines, 'Asesor', 'Vendedor', 'Agente', 'Atendido por')
  // Si no hay campo etiquetado, buscar última línea corta sin ":" (ej. "JF", "luisa")
  if (!asesorRaw) {
    const ultimaLinea = [...lines].reverse().find((l) => !l.includes(':') && l.length <= 30 && l.length >= 1)
    if (ultimaLinea) asesorRaw = ultimaLinea
  }
  // Asesor es opcional — si no viene, se toma del usuario logueado en la acción

  // ── Precios individuales y total ─────────────────────────────────────────
  let preciosNum: number[] = []
  let totalExplicitoDePrecios: number | null = null
  for (const precioRaw of todosPrecios) {
    const { individuales, total: t } = parsearPreciosExpresion(precioRaw)
    preciosNum.push(...individuales.filter(n => !isNaN(n) && n > 0))
    if (!totalExplicitoDePrecios && t) totalExplicitoDePrecios = t
  }
  const totalExplicitoRaw = findRaw(lines, 'Total', 'Precio total', 'Valor total')
  const total = totalExplicitoRaw
    ? (parseInt(totalExplicitoRaw.replace(/\./g, '').replace(/[^\d]/g, ''), 10) || 0)
    : (totalExplicitoDePrecios ?? preciosNum.reduce((a, b) => a + b, 0))

  // ── Abono (suma de todos los abonos) ─────────────────────────────────────
  const abonosParsed = todosAbonos.map(a => parseMontoMetodo(a))
  const abono = Math.min(abonosParsed.reduce((s, p) => s + p.monto, 0), total)
  const metodoDesdeAbono = abonosParsed.find(p => p.monto > 0)?.metodo ?? 'efectivo'

  // Método de pago: campo explícito tiene prioridad sobre el detectado del abono
  const metodoCampo = findRaw(lines, 'Método de pago', 'Metodo pago', 'Pago')
  const metodoPago: MetodoPago = metodoCampo ? detectarMetodo(metodoCampo) : metodoDesdeAbono

  // ── Opcionales ────────────────────────────────────────────────────────────
  const cedulaRaw = findRaw(lines, 'Cédula', 'CC', 'Documento', 'Doc')
  const clienteDoc = cedulaRaw ? `CC ${cedulaRaw.replace(/^CC\s*/i, '').trim()}` : null

  const direccionRaw = findRaw(lines, 'Dirección', 'Dirección de entrega', 'Dir')
  const barrioRaw = findRaw(lines, 'Barrio')
  const ciudadRaw = findRaw(lines, 'Ciudad')
  const tipoEntrega: 'domicilio' | 'sede' = direccionRaw ? 'domicilio' : 'sede'
  const direccion = direccionRaw
    ? [direccionRaw, barrioRaw && `Barrio ${barrioRaw}`, ciudadRaw].filter(Boolean).join(', ')
    : null

  const notas = findRaw(lines, 'Notas', 'Observaciones', 'Nota')

  // ── Productos (uno o varios) ──────────────────────────────────────────────
  const todosNombresEtiquetados = collectAll(lines, 'Nombre del producto', 'Nombre producto', 'Nombre prenda')
  // Líneas huérfanas (sin ":", no URL, no orden, >10 chars) actúan como nombres adicionales
  const lineasHuerfanas = lines.filter(l =>
    !l.includes(':') &&
    !/^https?:\/\//i.test(l) &&
    !/^(TR|CR|SR)\d+/i.test(l) &&
    l.length > 10 &&
    !esDireccion(l)
  )
  // Etiquetados tienen prioridad; huérfanas rellenan los slots sin nombre
  const todosNombres = [...todosNombresEtiquetados]
  for (const h of lineasHuerfanas) {
    if (!todosNombres.includes(h)) todosNombres.push(h)
  }

  let productos: ParsedPedido['productos']
  if (lineasConTalla.length > 0) {
    // Formato "[artículo] talla [X]" — un producto por línea detectada
    productos = lineasConTalla.map((item, i) => ({
      marca: '',
      descripcion: item.descripcion,
      talla: item.talla,
      cantidad: 1,
      precio_venta: item.precioEmbebido ?? preciosNum[i] ?? preciosNum[preciosNum.length - 1] ?? 0,
    }))
  } else if (todosArticulos.length === 0) {
    // Sin artículos detectados: crear un slot vacío para que el usuario complete
    productos = [{ marca: '', descripcion: '', talla: todasTallas[0] ?? null, cantidad: 1, precio_venta: preciosNum[0] ?? 0 }]
  } else {
    productos = todosArticulos.map((art, i) => {
      const precio  = preciosNum[i] ?? preciosNum[preciosNum.length - 1] ?? 0
      const talla   = todasTallas[i] ?? todasTallas[0] ?? null
      const esLink  = /^https?:\/\//i.test(art)

      let marca: string
      let descripcion: string

      if (esLink) {
        marca = marcaDesdeUrl(art)
        const nombre = todosNombres[i] ?? descDesdeUrl(art)
        descripcion = nombre
      } else {
        const partes = art.split(/\s+/)
        marca = partes[0]
        descripcion = partes.slice(1).join(' ') || art
      }

      return { marca, descripcion, talla, cantidad: 1, precio_venta: precio }
    })
  }

  return {
    ok: true,
    data: {
      formato_version: '1',
      sede,
      numero_orden_sugerido: numeroOrden,
      asesor: asesorRaw ?? undefined,
      cliente_nombre: clienteNombre ?? '',
      cliente_doc: clienteDoc,
      cliente_telefono: telefono,
      productos,
      total,
      abono,
      metodo_pago_abono: metodoPago,
      tipo_entrega: tipoEntrega,
      direccion,
      notas,
    },
    warnings: advertencias.length > 0 ? advertencias : undefined,
  }
}

// ── Exportación principal ─────────────────────────────────────────────────────

export function parsearPedido(texto: string): ParseResult {
  if (texto.includes('===INICIO_PEDIDO===')) return parsearEstructurado(texto)
  return parsearLibre(texto)
}
