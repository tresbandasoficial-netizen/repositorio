// Parser automático: detecta campos de un domicilio desde texto libre pegado
export type DomicilioParsed = {
  cliente_nombre: string
  cliente_telefono: string
  direccion: string
  mensajeria: 'exneider' | 'servigo' | ''
  valor_domicilio: number
  cobrar_al_cliente: boolean
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
  let valor_domicilio = 0
  let cobrar_al_cliente = true
  let numero_pedido = ''
  let notas = ''

  for (const line of lines) {
    const ln = nc(line)

    // Mensajería
    if (/exneider/.test(ln)) { mensajeria = 'exneider'; continue }
    if (/servigo/.test(ln))  { mensajeria = 'servigo';  continue }

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
    const valorMatch = line.replace(/\./g, '').match(/\$?\s*(\d{3,7})/)
    if (valorMatch && !valor_domicilio) {
      const v = parseInt(valorMatch[1], 10)
      if (v >= 1000 && v <= 50000) { valor_domicilio = v; continue }
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
    valor_domicilio,
    cobrar_al_cliente,
    numero_pedido,
    notas,
  }
}

// Genera el mensaje formateado para enviar a la mensajería
export function buildMensajeMensajeria(d: {
  cliente_nombre: string
  cliente_telefono: string | null
  direccion: string
  valor_domicilio: number
  cobrar_al_cliente: boolean
  numero_pedido: string | null
  notas: string | null
  asesor_nombre: string
}): string {
  const valor = d.cobrar_al_cliente
    ? `$${d.valor_domicilio.toLocaleString('es-CO')}`
    : 'Sin cobro'
  const pedido = d.numero_pedido ? `\nPedido: ${d.numero_pedido}` : ''
  const notas = d.notas ? `\nNotas: ${d.notas}` : ''
  return `*DOMICILIO*\nCliente: ${d.cliente_nombre}\nCelular: ${d.cliente_telefono ?? '—'}\nDirección: ${d.direccion}\nValor: ${valor}\nAsesor: ${d.asesor_nombre}${pedido}${notas}`
}

// Genera la línea para Excel (separada por |)
export function buildLineaExcel(d: {
  fecha: string
  cliente_nombre: string
  cliente_telefono: string | null
  direccion: string
  mensajeria: string
  valor_domicilio: number
  cobrar_al_cliente: boolean
  numero_pedido: string | null
  asesor_nombre: string
}): string {
  const valor = d.cobrar_al_cliente
    ? `$${d.valor_domicilio.toLocaleString('es-CO')}`
    : 'Sin cobro'
  return [
    d.fecha,
    d.mensajeria.charAt(0).toUpperCase() + d.mensajeria.slice(1),
    d.cliente_nombre,
    d.cliente_telefono ?? '',
    d.direccion,
    valor,
    d.asesor_nombre,
    d.numero_pedido ?? '',
  ].join(' | ')
}
