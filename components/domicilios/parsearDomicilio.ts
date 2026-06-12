// Parser automático: detecta campos de un domicilio desde texto libre pegado
export type DomicilioParsed = {
  cliente_nombre: string
  cliente_telefono: string
  direccion: string
  mensajeria: 'exneider' | 'servigo' | ''
  valor_pedido: number
  valor_domicilio: number
  cobrar_al_cliente: boolean
  metodo_pago: 'efectivo' | 'transferencia'
  articulo: string
  numero_pedido: string
  notas: string
}

const ASESORES: Record<string, string> = {
  daniela: 'Daniela',
  jhonfredy: 'Jhonfredy',
  jf: 'Jhonfredy',
  ronaldo: 'Ronaldo',
  johan: 'Johan',
}

function nc(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export function parsearDomicilio(texto: string): DomicilioParsed {
  const lines = texto.split('\n').map(l => l.trim()).filter(Boolean)

  let cliente_nombre = ''
  let cliente_telefono = ''
  let direccion = ''
  let mensajeria: 'exneider' | 'servigo' | '' = ''
  let valor_pedido = 0
  let valor_domicilio = 0
  let cobrar_al_cliente = true
  let metodo_pago: 'efectivo' | 'transferencia' = 'efectivo'
  let articulo = ''
  let numero_pedido = ''
  let notas = ''

  for (const line of lines) {
    const ln = nc(line)

    // Mensajería
    if (/exneider/.test(ln)) { mensajeria = 'exneider'; continue }
    if (/servigo/.test(ln))  { mensajeria = 'servigo';  continue }

    // Método de pago
    if (/transferencia|transfirio|transferido|nequi|daviplata|bancolombia/.test(ln)) {
      metodo_pago = 'transferencia'
      if (/^(pago|pag[oó]|metodo|m[ée]todo)?\s*:?\s*(por\s+)?(transferencia|nequi|daviplata|bancolombia)\s*$/.test(ln)) continue
    }
    if (/^(pago\s*:?\s*)?(en\s+)?efectivo\s*$/.test(ln)) { metodo_pago = 'efectivo'; continue }

    // Artículo (con prefijo explícito)
    const artMatch = line.match(/^art[ií]culo\s*:?\s*(.+)$/i) ?? line.match(/^(?:se\s+env[ií]a|env[ií]o)\s*:?\s*(.+)$/i)
    if (artMatch && !articulo) { articulo = artMatch[1].trim(); continue }

    // Número de pedido (TR/CR/SR + dígitos)
    const pedidoMatch = line.match(/\b(TR|CR|SR)\d+\b/i)
    if (pedidoMatch && !numero_pedido) { numero_pedido = pedidoMatch[0].toUpperCase(); }

    // Celular colombiano (10 dígitos empezando en 3)
    const celMatch = line.replace(/[\s\-()]/g, '').match(/\b3\d{9}\b/)
    if (celMatch && !cliente_telefono) { cliente_telefono = celMatch[0]; continue }

    // Valor / cobro
    if (/no\s+cobrar|sin\s+cobro|gratis|nada/.test(ln)) {
      cobrar_al_cliente = false
      continue
    }
    // Valores: <= $20.000 se asume domicilio, mayores se asumen valor del pedido
    const valorMatch = line.replace(/\./g, '').match(/\$?\s*(\d{4,8})/)
    if (valorMatch) {
      const v = parseInt(valorMatch[1], 10)
      if (v >= 1000 && v <= 20000 && !valor_domicilio) { valor_domicilio = v; continue }
      if (v > 20000 && v <= 10000000 && !valor_pedido) { valor_pedido = v; continue }
    }

    // Dirección colombiana
    if (/^(cll|calle|cra|carrera|av\b|avenida|tv|transv|diag|kr|cl)\b/i.test(line)) {
      if (!direccion) { direccion = line; continue }
    }
    if (!direccion && /\b(#|no\.?)\s*\d/.test(line)) {
      direccion = line; continue
    }

    // Asesor (ignorar, ya lo sabemos del usuario logueado)
    if (Object.keys(ASESORES).some(k => nc(line) === k || nc(line).startsWith(k + ' '))) continue

    // Si nada más coincide y no tenemos nombre, tomar como nombre
    if (!cliente_nombre && line.length >= 3 && line.length <= 60 && !/\d{5,}/.test(line)) {
      cliente_nombre = line
    } else if (cliente_nombre && !direccion && line.length >= 5) {
      // Segunda línea sin clasificar → podría ser dirección
      if (!direccion) direccion = line
    } else if (line.length > 0) {
      notas = notas ? `${notas} | ${line}` : line
    }
  }

  return {
    cliente_nombre,
    cliente_telefono,
    direccion,
    mensajeria,
    valor_pedido,
    valor_domicilio,
    cobrar_al_cliente,
    metodo_pago,
    articulo,
    numero_pedido,
    notas,
  }
}

// Genera el mensaje formateado para enviar a la mensajería
function fmt(v: number) {
  return `$${v.toLocaleString('es-CO')}`
}

export function buildMensajeMensajeria(d: {
  cliente_nombre: string
  cliente_telefono: string | null
  direccion: string
  valor_pedido: number
  valor_domicilio: number
  cobrar_al_cliente: boolean
  metodo_pago: 'efectivo' | 'transferencia'
  articulo: string | null
  numero_pedido: string | null
  notas: string | null
  asesor_nombre: string
}): string {
  // Qué debe cobrar la mensajería al cliente
  const cobraPedido = d.metodo_pago === 'efectivo' ? d.valor_pedido : 0
  const cobraDomicilio = d.cobrar_al_cliente ? d.valor_domicilio : 0
  const totalCobrar = cobraPedido + cobraDomicilio

  let cobro: string
  if (totalCobrar === 0) {
    cobro = 'NO COBRAR NADA (ya está pago)'
  } else {
    const partes: string[] = []
    if (cobraPedido > 0) partes.push(`${fmt(cobraPedido)} pedido`)
    if (cobraDomicilio > 0) partes.push(`${fmt(cobraDomicilio)} domicilio`)
    cobro = `${fmt(totalCobrar)} (${partes.join(' + ')})`
  }

  const pagoInfo = d.metodo_pago === 'transferencia' ? '\nPedido ya pagado por transferencia' : ''
  const domNuestro = !d.cobrar_al_cliente ? '\nEl domicilio lo pagamos nosotros' : ''
  const articulo = d.articulo ? `\nArtículo: ${d.articulo}` : ''
  const pedido = d.numero_pedido ? `\nPedido: ${d.numero_pedido}` : ''
  const notas = d.notas ? `\nNotas: ${d.notas}` : ''
  return `*DOMICILIO*\nCliente: ${d.cliente_nombre}\nCelular: ${d.cliente_telefono ?? '—'}\nDirección: ${d.direccion}${articulo}\n*Cobrar al cliente: ${cobro}*${pagoInfo}${domNuestro}\nAsesor: ${d.asesor_nombre}${pedido}${notas}`
}

// Genera la línea para Excel (separada por |)
export function buildLineaExcel(d: {
  fecha: string
  cliente_nombre: string
  cliente_telefono: string | null
  direccion: string
  mensajeria: string
  valor_pedido: number
  valor_domicilio: number
  cobrar_al_cliente: boolean
  metodo_pago: 'efectivo' | 'transferencia'
  articulo: string | null
  numero_pedido: string | null
  asesor_nombre: string
}): string {
  const pedidoEfectivo = d.metodo_pago === 'efectivo' ? fmt(d.valor_pedido) : 'Transferencia'
  const domicilio = d.cobrar_al_cliente
    ? `${fmt(d.valor_domicilio)} cliente`
    : `${fmt(d.valor_domicilio)} nosotros`
  return [
    d.fecha,
    d.mensajeria.charAt(0).toUpperCase() + d.mensajeria.slice(1),
    d.cliente_nombre,
    d.cliente_telefono ?? '',
    d.direccion,
    d.articulo ?? '',
    pedidoEfectivo,
    domicilio,
    d.asesor_nombre,
    d.numero_pedido ?? '',
  ].join(' | ')
}
