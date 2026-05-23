import { MetodoPago, ParsedPedido, ParseResult } from '@/types'
import { normalizarTelefono } from '@/lib/utils/phone'

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

export function parsearPedido(texto: string): ParseResult {
  const inicioIdx = texto.indexOf('===INICIO_PEDIDO===')
  const finIdx = texto.indexOf('===FIN_PEDIDO===')

  if (inicioIdx === -1) return { ok: false, error: 'Falta marcador ===INICIO_PEDIDO===' }
  if (finIdx === -1) return { ok: false, error: 'Falta marcador ===FIN_PEDIDO===' }
  if (finIdx < inicioIdx) return { ok: false, error: 'Marcadores en orden incorrecto' }

  const bloque = texto.slice(inicioIdx + '===INICIO_PEDIDO==='.length, finIdx)
  const lines = bloque.split('\n').filter((l) => l.trim() !== '')

  // Version
  const version = extractField(lines, 'FORMATO_VERSION')
  if (!version) return { ok: false, error: 'Falta campo FORMATO_VERSION' }
  if (version !== VERSION_SOPORTADA)
    return { ok: false, error: `Versión de formato "${version}" no soportada. Versión actual: ${VERSION_SOPORTADA}` }

  // Sede
  const sedeRaw = extractField(lines, 'SEDE')
  if (!sedeRaw) return { ok: false, error: 'Falta campo SEDE' }
  if (!SEDES_VALIDAS.includes(sedeRaw as (typeof SEDES_VALIDAS)[number]))
    return { ok: false, error: `SEDE "${sedeRaw}" no válida. Válidas: ${SEDES_VALIDAS.join(', ')}` }

  // Asesor
  const asesor = extractField(lines, 'ASESOR')
  if (!asesor) return { ok: false, error: 'Falta campo ASESOR' }

  // Cliente nombre
  const clienteNombre = extractField(lines, 'CLIENTE_NOMBRE')
  if (!clienteNombre) return { ok: false, error: 'Falta campo CLIENTE_NOMBRE' }

  // Teléfono
  const telefonoRaw = extractField(lines, 'CLIENTE_TELEFONO')
  if (!telefonoRaw) return { ok: false, error: 'Falta campo CLIENTE_TELEFONO' }
  const telefonoNormalizado = normalizarTelefono(telefonoRaw)
  if (!telefonoNormalizado)
    return { ok: false, error: `CLIENTE_TELEFONO "${telefonoRaw}" no es un número colombiano válido` }

  // Doc (opcional)
  const clienteDoc = extractField(lines, 'CLIENTE_DOC')

  // Productos
  const productosResult = parseProductos(lines)
  if ('error' in productosResult) return { ok: false, error: productosResult.error }
  const productos = productosResult

  // Total
  const totalRaw = extractField(lines, 'TOTAL')
  if (!totalRaw) return { ok: false, error: 'Falta campo TOTAL' }
  const total = parseInt(totalRaw.replace(/\D/g, ''), 10)
  if (isNaN(total) || total < 0) return { ok: false, error: `TOTAL "${totalRaw}" inválido` }

  // Validar suma de productos = total
  const sumaProductos = productos.reduce((acc, p) => acc + p.precio_venta * p.cantidad, 0)
  if (sumaProductos !== total)
    return {
      ok: false,
      error: `La suma de productos (${sumaProductos}) no coincide con TOTAL (${total}). Revisa el resumen del Claude externo.`,
    }

  // Abono
  const abonoRaw = extractField(lines, 'ABONO') ?? '0'
  const abono = parseInt(abonoRaw.replace(/\D/g, ''), 10)
  if (isNaN(abono) || abono < 0) return { ok: false, error: `ABONO "${abonoRaw}" inválido` }
  if (abono > total) return { ok: false, error: `ABONO (${abono}) no puede ser mayor que TOTAL (${total})` }

  // Método de pago
  const metodoPagoRaw = (extractField(lines, 'METODO_PAGO_ABONO') ?? 'efectivo').toLowerCase()
  const metodoPago = METODOS_PAGO.find((m) => m === metodoPagoRaw) ?? 'otro'

  // Entrega
  const entregaRaw = (extractField(lines, 'ENTREGA') ?? 'sede').toLowerCase()
  const tipoEntrega: 'domicilio' | 'sede' = entregaRaw === 'domicilio' ? 'domicilio' : 'sede'

  const direccion = tipoEntrega === 'domicilio' ? extractField(lines, 'DIRECCION') : null
  if (tipoEntrega === 'domicilio' && !direccion)
    return { ok: false, error: 'ENTREGA es "Domicilio" pero falta el campo DIRECCION' }

  // Notas
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
