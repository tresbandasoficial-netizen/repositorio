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
  const usado = new Set<number>()

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

  // ── PASADA 1: campos inequívocos ──────────────────────────────────────────
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const ln = nc(line)

    // Dirección formal PRIMERO — antes del bloque colon, para que "Calle... BARRIO:xxx"
    // no se interprete como clave:valor por el colon dentro de la línea
    if (/^(cll|calle|cra|carrera|cr|kr|cl|av|avenida|tv|transv|transversal|diag|diagonal|mz|manzana|circular|autopista|km)[\s.#]/i.test(line)) {
      // Limpiar "BARRIO:Xxx" dentro de la dirección para que quede legible
      const dirLimpia = line.replace(/\s+BARRIO\s*:\s*/gi, ', ').trim()
      direccion = dirLimpia; usado.add(i); continue
    }

    // Plantilla "clave: valor"
    const ci = line.indexOf(':')
    if (ci > 0 && ci < 35) {
      const key = nc(line.slice(0, ci))
      const val = line.slice(ci + 1).trim()
      const valNc = nc(val)

      if (['nombre', 'cliente'].includes(key)) {
        if (val) cliente_nombre = val; usado.add(i); continue
      }
      if (['celular', 'telefono', 'tel', 'cel', 'whatsapp'].includes(key)) {
        const c = val.replace(/\D/g, ''); if (c) cliente_telefono = c; usado.add(i); continue
      }
      if (['direccion', 'dir'].includes(key)) {
        if (val) direccion = val; usado.add(i); continue
      }
      if (key === 'mensajeria') {
        if (valNc.includes('exneider')) mensajeria = 'exneider'
        else if (valNc.includes('servigo')) mensajeria = 'servigo'
        usado.add(i); continue
      }
      if (['fecha', 'asesor', 'talla', 'abono', 'referencia', 'ref'].includes(key)) {
        usado.add(i); continue
      }
      if (['observaciones', 'observacion', 'notas', 'nota', 'indicaciones'].includes(key)) {
        if (val) notas = notas ? `${notas} | ${val}` : val; usado.add(i); continue
      }
      if (key.startsWith('pedido o articulo') || ['articulo', 'articulos', 'articulo enviado', 'pedido'].includes(key)) {
        if (val) {
          const pm = val.match(/\b(TR|CR|SR)\d+\b/i)
          if (pm && !numero_pedido) numero_pedido = pm[0].toUpperCase()
          const resto = val.replace(/\b(TR|CR|SR)\d+\b\s*[\/|,-]?\s*/i, '').trim()
          if (resto && !articulo) articulo = resto
        }
        usado.add(i); continue
      }
      if (['valor a cobrar', 'valor', 'valor pedido', 'valor del pedido', 'precio', 'total'].includes(key)) {
        const v = parseInt(val.replace(/\D/g, ''), 10) || 0
        if (v === 0 || /no\s+cobrar|nada/.test(valNc)) { metodo_pago = 'transferencia' }
        else if (v <= 20000) { valor_domicilio = v }
        else { valor_pedido = v; metodo_pago = 'efectivo' }
        usado.add(i); continue
      }
      if (['valor domicilio', 'valor del domicilio', 'domicilio', 'domi'].includes(key)) {
        valor_domicilio = parseInt(val.replace(/\D/g, ''), 10) || 0; usado.add(i); continue
      }
      // clave desconocida → ignorar línea completa
      usado.add(i); continue
    }

    // Número de pedido solo en la línea (ej. TR6282)
    if (/^\s*(TR|CR|SR)\d+\s*$/i.test(line)) {
      if (!numero_pedido) numero_pedido = line.trim().toUpperCase()
      usado.add(i); continue
    }
    // Pedido dentro de otra línea → extraer pero no consumir la línea
    const pm = line.match(/\b(TR|CR|SR)\d+\b/i)
    if (pm && !numero_pedido) numero_pedido = pm[0].toUpperCase()

    // Celular colombiano (10 dígitos empezando en 3)
    const celMatch = line.replace(/[\s\-()]/g, '').match(/^3\d{9}$/)
    if (celMatch && !cliente_telefono) { cliente_telefono = celMatch[0]; usado.add(i); continue }

    // Cédula (8-11 dígitos, no empieza en 3) — case-insensitive para "Cc 123..."
    if (/^(cc\s*:?\s*)?\d{8,11}$/i.test(line.replace(/[\s.]/g, '')) && !line.replace(/\D/g,'').startsWith('3')) {
      usado.add(i); continue
    }

    // Talla sin colon ("Talla L", "Talla XL", "Talla 32", etc.) → ignorar
    if (/^talla\s+\S+$/i.test(ln)) { usado.add(i); continue }

    // Abono/valo sin colon ("abono 0", "valo 299000") → ignorar (son del pedido)
    if (/^(abono|valo[r]?)\s+[\d.,]+$/i.test(ln)) { usado.add(i); continue }

    // Mensajería
    if (/^exneider\s*$/.test(ln)) { mensajeria = 'exneider'; usado.add(i); continue }
    if (/^servigo\s*$/.test(ln))  { mensajeria = 'servigo';  usado.add(i); continue }
    if (/exneider/.test(ln) && line.length < 25) { mensajeria = 'exneider'; usado.add(i); continue }
    if (/servigo/.test(ln)  && line.length < 25) { mensajeria = 'servigo';  usado.add(i); continue }

    // Pago
    if (/no\s+cobrar|sin\s+cobro|gratis|ya\s+pag[oó]/.test(ln)) {
      cobrar_al_cliente = false; metodo_pago = 'transferencia'; usado.add(i); continue
    }
    if (/^(transferencia|nequi|daviplata|bancolombia)/.test(ln)) {
      metodo_pago = 'transferencia'; usado.add(i); continue
    }
    if (/^efectivo$/.test(ln)) { metodo_pago = 'efectivo'; usado.add(i); continue }

    // Artículo con prefijo explícito
    const artMatch = line.match(/^art[ií]culo\s*:?\s*(.+)$/i)
    if (artMatch && !articulo) { articulo = artMatch[1].trim(); usado.add(i); continue }

    // Dirección con # o No.
    if (/(#|n[o°]\.?)\s*\d/i.test(line) && !direccion) {
      direccion = line; usado.add(i); continue
    }

    // Valor numérico solo en la línea
    if (/^\$?\s*[\d.,]+\s*$/.test(line)) {
      const v = parseInt(line.replace(/\D/g, ''), 10)
      if (v >= 1000 && v <= 20000 && !valor_domicilio) { valor_domicilio = v; usado.add(i); continue }
      if (v > 20000 && v <= 10000000 && !valor_pedido) { valor_pedido = v; metodo_pago = 'efectivo'; usado.add(i); continue }
    }

    // Asesor conocido → ignorar
    if (Object.keys(ASESORES).some(k => ln === k || ln.startsWith(k + ' '))) {
      usado.add(i); continue
    }
  }

  // ── PASADA 2: líneas restantes → nombre y notas ───────────────────────────
  for (let i = 0; i < lines.length; i++) {
    if (usado.has(i)) continue
    const line = lines[i]
    const ln = nc(line)

    // Indicaciones de entrega → notas
    if (/\b(dejar|entregar|llamar|llame|timbrar|preguntar|recibe|recibir|horario|porter[ií]a|portero|antes|despu[eé]s|entregar a|preguntar por)\b/i.test(line)) {
      notas = notas ? `${notas} | ${line}` : line; continue
    }

    // Parece nombre: sin dígitos, 2+ palabras o longitud razonable
    if (!cliente_nombre && !/\d/.test(line) && line.length >= 4 && line.length <= 55) {
      cliente_nombre = line; continue
    }

    // Ciudad/barrio corto sin dígitos → complementa dirección si ya existe
    if (direccion && !/\d/.test(line) && line.length <= 30 && line.split(/\s+/).length <= 3) {
      direccion = `${direccion}, ${line}`; continue
    }

    // Resto → notas
    if (line.length > 0) notas = notas ? `${notas} | ${line}` : line
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
