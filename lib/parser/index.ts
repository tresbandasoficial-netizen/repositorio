import { MetodoPago, ParsedPedido, ParseResult } from '@/types'
import { normalizarTelefono } from '@/lib/utils/phone'

// ── Formato estructurado (===INICIO_PEDIDO===) ────────────────────────────────

const SEDES_VALIDAS = ['TR', 'CR', 'SR'] as const
const METODOS_PAGO: MetodoPago[] = ['efectivo', 'transferencia', 'datafono', 'otro']
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

function parseMontoMetodo(texto: string): { monto: number; metodo: MetodoPago } {
  const numStr = texto.match(/[\d.,´']+/)?.[0] ?? '0'
  const monto = parseInt(numStr.replace(/[.,´']/g, ''), 10) || 0

  const lower = texto.toLowerCase()
  let metodo: MetodoPago = 'efectivo'
  if (/bancolombia|nequi|daviplata|transferencia|pse|consignacion|consignación/.test(lower))
    metodo = 'transferencia'
  else if (/datafono|datáfono|tarjeta/.test(lower)) metodo = 'datafono'
  else if (/efectivo|cash/.test(lower)) metodo = 'efectivo'

  return { monto, metodo }
}

function findRaw(lines: string[], ...claves: string[]): string | null {
  for (const line of lines) {
    for (const clave of claves) {
      const regex = new RegExp(`^${clave}\\s*:(.+)`, 'i')
      const m = line.match(regex)
      if (m) return m[1].trim()
    }
  }
  return null
}

// Igual que findRaw pero devuelve TODOS los valores que coincidan (para campos repetidos)
function collectAll(lines: string[], ...claves: string[]): string[] {
  const results: string[] = []
  for (const line of lines) {
    for (const clave of claves) {
      const regex = new RegExp(`^${clave}\\s*:(.+)`, 'i')
      const m = line.match(regex)
      if (m) { results.push(m[1].trim()); break }
    }
  }
  return results
}

function parsearLibre(texto: string): ParseResult {
  const lines = texto.split('\n').map((l) => l.trim()).filter(Boolean)
  const faltantes: string[] = []

  // ── Número de pedido (obligatorio — define la sede) ───────────────────────
  const numeroCampo = findRaw(lines, 'Número de pedido', 'Numero de pedido', 'Número de Pedido', 'Numero de Pedido', 'N° Pedido', 'No de Pedido', 'No\\. Pedido', 'Pedido', 'Orden')
  const ordenSuelto = lines.find(l => /^(TR|CR|SR)\d+$/i.test(l))
  const numeroPedido = numeroCampo ?? ordenSuelto ?? null
  if (!numeroPedido) return { ok: false, error: 'Falta el número de pedido (ej. TR5946). Debe empezar con TR, CR o SR.' }
  const numeroOrden = numeroPedido.trim().toUpperCase()

  const prefijo = numeroOrden.slice(0, 2) as 'TR' | 'CR' | 'SR'
  if (!SEDES_VALIDAS.includes(prefijo))
    return { ok: false, error: `El número de pedido "${numeroOrden}" debe empezar con TR (Bucaramanga), CR (Cúcuta) o SR (Santa Rosa).` }
  const sede = prefijo

  // ── Campos obligatorios ───────────────────────────────────────────────────
  const clienteNombre = findRaw(lines, 'Nombre', 'Cliente', 'Nombre del cliente')
  if (!clienteNombre) faltantes.push('Nombre')

  const telefonoRaw = findRaw(lines, 'Celular', 'Teléfono', 'Telefono', 'Tel', 'Cel')
  if (!telefonoRaw) faltantes.push('Celular')

  // Recoger TODOS los artículos (etiquetados o links sueltos)
  const articuloKeys = ['Artículo/Link', 'Articulo/Link', 'Artículo', 'Articulo', 'Código de producto', 'Codigo de producto', 'Código', 'Codigo', 'Producto', 'Prenda', 'Ref', 'Referencia', 'Link', 'URL']
  const todosArticulos: string[] = []
  for (const line of lines) {
    let matched = false
    for (const clave of articuloKeys) {
      const m = line.match(new RegExp(`^${clave}\\s*:(.+)`, 'i'))
      if (m) { todosArticulos.push(m[1].trim()); matched = true; break }
    }
    if (!matched && /^https?:\/\//i.test(line)) todosArticulos.push(line.trim())
  }
  if (todosArticulos.length === 0) faltantes.push('Artículo (o pega el link del producto)')

  const todasTallasRaw = collectAll(lines, 'Talla')
  const todasTallas = todasTallasRaw.flatMap(t => t.split(/\s*\/\s*/).map(s => s.trim()).filter(Boolean))
  if (todasTallas.length === 0) faltantes.push('Talla')

  const todosPrecios = collectAll(lines, 'Precio', 'Valor', 'Costo')
  if (todosPrecios.length === 0) faltantes.push('Precio')

  const todosAbonos  = collectAll(lines, 'Abono', 'Anticipo', 'Adelanto', 'Cuota inicial', 'Separado')
  const abonoRaw = todosAbonos[0] ?? null

  let asesorRaw = findRaw(lines, 'Asesor', 'Vendedor', 'Agente', 'Atendido por')
  // Si no hay campo etiquetado, buscar última línea corta sin ":" (ej. "JF", "luisa")
  if (!asesorRaw) {
    const ultimaLinea = [...lines].reverse().find((l) => !l.includes(':') && l.length <= 30 && l.length >= 1)
    if (ultimaLinea) asesorRaw = ultimaLinea
  }
  // Asesor es opcional — si no viene, se toma del usuario logueado en la acción

  if (faltantes.length > 0)
    return { ok: false, error: `Faltan los siguientes campos obligatorios: ${faltantes.join(', ')}.` }

  // ── Validar teléfono ──────────────────────────────────────────────────────
  const telefono = normalizarTelefono(telefonoRaw!)
  if (!telefono) return { ok: false, error: `El celular "${telefonoRaw}" no es un número colombiano válido.` }

  // ── Precios individuales y total ─────────────────────────────────────────
  let preciosNum: number[] = []
  let totalExplicitoDePrecios: number | null = null
  for (const precioRaw of todosPrecios) {
    const { individuales, total: t } = parsearPreciosExpresion(precioRaw)
    preciosNum.push(...individuales)
    if (!totalExplicitoDePrecios && t) totalExplicitoDePrecios = t
  }
  if (preciosNum.some(p => isNaN(p) || p <= 0))
    return { ok: false, error: `Un precio no es válido. Escríbelo con puntos: ej. 350.000 o 1.050.000` }
  const totalExplicitoRaw = findRaw(lines, 'Total', 'Precio total', 'Valor total')
  const total = totalExplicitoRaw
    ? parseInt(totalExplicitoRaw.replace(/\./g, '').replace(/[^\d]/g, ''), 10)
    : (totalExplicitoDePrecios ?? preciosNum.reduce((a, b) => a + b, 0))

  // ── Abono (suma de todos los abonos) ─────────────────────────────────────
  const abonosParsed = todosAbonos.map(a => parseMontoMetodo(a))
  const abono = abonosParsed.reduce((s, p) => s + p.monto, 0)
  const metodoDesdeAbono = abonosParsed.find(p => p.monto > 0)?.metodo ?? 'efectivo'
  if (abono > total) return { ok: false, error: `El abono (${abono.toLocaleString('es-CO')}) no puede superar el precio (${total.toLocaleString('es-CO')}).` }

  // Método de pago: campo explícito tiene prioridad sobre el detectado del abono
  const metodoCampo = findRaw(lines, 'Método de pago', 'Metodo de pago', 'Método pago', 'Metodo pago', 'Pago')
  let metodoPago: MetodoPago = metodoDesdeAbono
  if (metodoCampo) {
    const lower = metodoCampo.toLowerCase()
    if (/bancolombia|nequi|daviplata|transferencia|pse|consignacion|consignación/.test(lower))
      metodoPago = 'transferencia'
    else if (/datafono|datáfono|tarjeta/.test(lower)) metodoPago = 'datafono'
    else if (/efectivo|cash/.test(lower)) metodoPago = 'efectivo'
    else metodoPago = 'otro'
  }

  // ── Opcionales ────────────────────────────────────────────────────────────
  const cedulaRaw = findRaw(lines, 'Cédula', 'Cedula', 'CC', 'Documento', 'Doc')
  const clienteDoc = cedulaRaw ? `CC ${cedulaRaw.replace(/^CC\s*/i, '').trim()}` : null

  const direccionRaw = findRaw(lines, 'Dirección', 'Direccion', 'Dirección de entrega', 'Dir')
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
    l.length > 10
  )
  // Etiquetados tienen prioridad; huérfanas rellenan los slots sin nombre
  const todosNombres = [...todosNombresEtiquetados]
  for (const h of lineasHuerfanas) {
    if (!todosNombres.includes(h)) todosNombres.push(h)
  }

  const productos: ParsedPedido['productos'] = todosArticulos.map((art, i) => {
    const precio  = preciosNum[i] ?? preciosNum[preciosNum.length - 1]
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

  return {
    ok: true,
    data: {
      formato_version: '1',
      sede,
      numero_orden_sugerido: numeroOrden,
      asesor: asesorRaw ?? undefined,
      cliente_nombre: clienteNombre!,
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
  }
}

// ── Exportación principal ─────────────────────────────────────────────────────

export function parsearPedido(texto: string): ParseResult {
  if (texto.includes('===INICIO_PEDIDO===')) return parsearEstructurado(texto)
  return parsearLibre(texto)
}
