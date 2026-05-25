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

function parsearLibre(texto: string): ParseResult {
  const lines = texto.split('\n').map((l) => l.trim()).filter(Boolean)
  const faltantes: string[] = []

  // ── Número de pedido (obligatorio — define la sede) ───────────────────────
  const numeroCampo = findRaw(lines, 'Numero de Pedido', 'N° Pedido', 'No de Pedido', 'No\\. Pedido', 'Pedido', 'Orden')
  const numeroPedido = numeroCampo ?? (lines[0]?.match(/^(TR|CR|SR)\d+$/i)?.[0] ?? null)
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

  // Buscar artículo: campo etiquetado primero, luego cualquier línea que sea un link
  let articuloRaw = findRaw(lines, 'Artículo', 'Articulo', 'Código de producto', 'Codigo de producto', 'Código', 'Codigo', 'Producto', 'Prenda', 'Ref', 'Referencia', 'Link', 'URL')
  if (!articuloRaw) {
    // Si hay un link sin etiqueta en cualquier línea, usarlo
    const lineaLink = lines.find((l) => /^https?:\/\//i.test(l))
    if (lineaLink) articuloRaw = lineaLink
  }
  if (!articuloRaw) faltantes.push('Artículo (o pega el link del producto)')

  const tallaRaw = findRaw(lines, 'Talla')
  if (!tallaRaw) faltantes.push('Talla')

  const precioRaw = findRaw(lines, 'Precio', 'Valor', 'Costo')
  if (!precioRaw) faltantes.push('Precio')

  const abonoRaw = findRaw(lines, 'Abono', 'Anticipo', 'Adelanto', 'Cuota inicial', 'Separado')

  let asesorRaw = findRaw(lines, 'Asesor', 'Vendedor', 'Agente', 'Atendido por')
  // Si no hay campo etiquetado, buscar última línea corta sin ":" como asesor (ej. "JF")
  if (!asesorRaw) {
    const ultimaLinea = [...lines].reverse().find((l) => !l.includes(':') && l.length <= 30 && l.length >= 1)
    if (ultimaLinea) asesorRaw = ultimaLinea
  }
  if (!asesorRaw) faltantes.push('Asesor')

  if (faltantes.length > 0)
    return { ok: false, error: `Faltan los siguientes campos obligatorios: ${faltantes.join(', ')}.` }

  // ── Validar teléfono ──────────────────────────────────────────────────────
  const telefono = normalizarTelefono(telefonoRaw!)
  if (!telefono) return { ok: false, error: `El celular "${telefonoRaw}" no es un número colombiano válido.` }

  // ── Validar precio ────────────────────────────────────────────────────────
  // Solo acepta puntos como separador de miles (ej: 350.000 o 1.050.000)
  const total = parseInt(precioRaw!.replace(/\./g, '').replace(/[^\d]/g, ''), 10)
  if (isNaN(total) || total <= 0)
    return { ok: false, error: `El precio "${precioRaw}" no es válido. Escríbelo con puntos: ej. 350.000 o 1.050.000` }

  // ── Abono (opcional — si no viene o es 0, el pedido queda sin abono) ──────
  const { monto: abono, metodo: metodoDesdeAbono } = parseMontoMetodo(abonoRaw ?? '0')
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

  // ── Producto ──────────────────────────────────────────────────────────────
  const esLink = /^https?:\/\//i.test(articuloRaw!)
  let marca: string
  let descripcion: string

  if (esLink) {
    // Con link: buscar nombre primero con etiqueta, luego línea sin etiqueta
    let nombreProducto = findRaw(lines, 'Nombre del producto', 'Nombre producto', 'Nombre prenda')

    if (!nombreProducto) {
      // La última línea corta sin ":" suele ser el asesor — excluirla
      const ultimaCorta = [...lines].reverse().find((l) => !l.includes(':') && l.length <= 30)
      // Cualquier línea sin ":", sin ser URL, sin ser número de pedido, sin ser la del asesor
      nombreProducto = lines.find((l) =>
        !l.includes(':') &&
        !/^https?:\/\//i.test(l) &&
        !/^(TR|CR|SR)\d+/i.test(l) &&
        l !== ultimaCorta &&
        l.length > 3
      ) ?? null
    }

    if (!nombreProducto)
      return { ok: false, error: 'Agrega el nombre del producto en una línea aparte. Ej:\ntenis nike air max' }
    marca = marcaDesdeUrl(articuloRaw!)
    descripcion = nombreProducto
  } else {
    const partes = articuloRaw!.split(/\s+/)
    marca = partes[0]
    descripcion = partes.slice(1).join(' ') || articuloRaw!
  }

  return {
    ok: true,
    data: {
      formato_version: '1',
      sede,
      numero_orden_sugerido: numeroOrden,
      asesor: asesorRaw!,
      cliente_nombre: clienteNombre!,
      cliente_doc: clienteDoc,
      cliente_telefono: telefono,
      productos: [{ marca, descripcion, talla: tallaRaw!, cantidad: 1, precio_venta: total }],
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
