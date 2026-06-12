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

    // Número de pedido (TR/CR/SR + dígitos pegados, ej TR6270)
    const pedidoMatch = line.match(/\b(TR|CR|SR)\d+\b/i)
    if (pedidoMatch && !numero_pedido) { numero_pedido = pedidoMatch[0].toUpperCase(); }

    // Celular colombiano (10 dígitos empezando en 3)
    const celMatch = line.replace(/[\s\-()]/g, '').match(/\b3\d{9}\b/)
    if (celMatch && !cliente_telefono) { cliente_telefono = celMatch[0]; continue }

    // Cédula: línea que es solo un número de 8-11 dígitos (no celular) → ignorar
    if (/^(cc|c\.c\.?|cedula|cédula)?\s*:?\s*\d{8,11}$/i.test(line.replace(/\./g, ''))) {
      continue
    }

    // "No cobrar nada" = pedido ya pagado y el domi corre por nuestra cuenta
    if (/no\s+cobrar|sin\s+cobro|gratis|ya\s+pag[oó]/.test(ln)) {
      cobrar_al_cliente = false
      metodo_pago = 'transferencia'
      continue
    }

    // Dirección colombiana (antes que valores, para no confundir apto/número con plata)
    if (/^(cll|calle|cra|carrera|cr|kr|cl|av|avenida|tv|transv|transversal|diag|diagonal|mz|manzana|circular|autopista|km)[\s.#]/i.test(line)) {
      if (!direccion) { direccion = line; continue }
    }
    if (!direccion && /(#|n[o°]\.?)\s*\d/i.test(line)) {
      direccion = line; continue
    }

    // Valores: solo líneas que son un número solo (con $ o puntos opcionales)
    // o que traen palabra clave de plata. <= $20.000 = domicilio, mayor = pedido
    const esNumeroSolo = /^\$?\s*\d{1,3}(?:[.,]\d{3})*\s*$/.test(line) || /^\$?\s*\d{4,8}\s*$/.test(line)
    const conClave = /(valor|precio|cobrar|cobro|total|domi(cilio)?)\s*:?\s*\$?\s*[\d.,]+/i.exec(ln)
    if (esNumeroSolo || conClave) {
      const crudo = (esNumeroSolo ? line : conClave![0]).replace(/[^\d]/g, '')
      const v = parseInt(crudo, 10)
      if (v >= 1000 && v <= 20000 && !valor_domicilio) { valor_domicilio = v; continue }
      if (v > 20000 && v <= 10000000 && !valor_pedido) { valor_pedido = v; continue }
    }

    // Asesor (ignorar, ya lo sabemos del usuario logueado)
    if (Object.keys(ASESORES).some(k => nc(line) === k || nc(line).startsWith(k + ' '))) continue

    // Si nada más coincide y no tenemos nombre, tomar como nombre
    if (!cliente_nombre && line.length >= 3 && line.length <= 60 && !/\d{5,}/.test(line)) {
      cliente_nombre = line
    } else if (cliente_nombre && !direccion && line.length >= 5 && !/^\d+$/.test(line)) {
      // Segunda línea sin clasificar → podría ser dirección
      direccion = line
    } else if (line.length > 0) {
      // Indicaciones de entrega → notas; barrio/ciudad → complementa la dirección
      const esIndicacion = /\b(dejar|entregar|entrega|llamar|llame|llamen|timbrar|timbre|preguntar|pregunte|recibe|reciben|recibir|horario|favor|porter[ií]a|portero|antes|despues|después)\b/i.test(ln)
      if (!esIndicacion && direccion && line.length <= 35 && !/\d/.test(line) && line.split(/\s+/).length <= 3) {
        direccion = `${direccion}, ${line}`
      } else {
        notas = notas ? `${notas} | ${line}` : line
      }
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
  fecha: string
  mensajeria: 'exneider' | 'servigo'
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
  // Qué cobra la mensajería al cliente:
  // - pedido en efectivo → cobra el pedido (+ su domicilio si lo paga el cliente)
  // - transferencia + cliente paga domi → cobra solo el domicilio
  // - transferencia + nosotros pagamos → NO COBRA NADA y le debemos el domi
  const cobraPedido = d.metodo_pago === 'efectivo' ? d.valor_pedido : 0
  const domiCliente = d.cobrar_al_cliente && d.valor_domicilio > 0
    ? `${fmt(d.valor_domicilio)} domicilio`
    : 'el domicilio'
  let cobro: string
  if (cobraPedido > 0) {
    cobro = d.cobrar_al_cliente
      ? `${fmt(cobraPedido)} + ${domiCliente}`
      : fmt(cobraPedido)
  } else if (d.cobrar_al_cliente) {
    cobro = `Solo ${domiCliente} (pedido ya pagado por transferencia)`
  } else {
    cobro = 'NO COBRAR NADA (pedido ya pagado por transferencia)'
  }

  const pedidoArticulos = [d.numero_pedido, d.articulo].filter(Boolean).join(' / ')

  const observaciones = [
    d.notas,
    !d.cobrar_al_cliente ? `El domicilio lo pagamos nosotros: ${fmt(d.valor_domicilio)}` : null,
  ].filter(Boolean).join(' | ')

  const mensajeriaLabel = d.mensajeria === 'exneider' ? 'Exneider' : 'Servigo'

  return [
    `Mensajería: ${mensajeriaLabel}`,
    `Fecha: ${d.fecha}`,
    `Nombre: ${d.cliente_nombre}`,
    `Celular: ${d.cliente_telefono ?? ''}`,
    `Dirección: ${d.direccion}`,
    `Pedido o artículos enviados: ${pedidoArticulos}`,
    `Valor a cobrar: ${cobro}`,
    `Observaciones: ${observaciones}`,
    `Asesor: ${d.asesor_nombre}`,
  ].join('\n')
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
