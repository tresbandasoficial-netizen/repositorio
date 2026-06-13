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

// Quita emojis y símbolos decorativos al inicio de una línea (ej. "📱 3104256432" → "3104256432")
function stripEmoji(s: string): string {
  return s.replace(/^[\p{Emoji}\p{So}\p{Sk}\-–—•*►▸→·]+\s*/u, '').trim()
}

// Extrae un número de valor monetario de un texto (quita puntos/comas de miles)
function parseValor(s: string): number {
  return parseInt(s.replace(/[^\d]/g, ''), 10) || 0
}

export function parsearDomicilio(texto: string): DomicilioParsed {
  // Pre-procesar: expandir líneas separadas por "/" o "|" usadas como separador de campos
  const rawLines = texto.split('\n').map(l => l.trim()).filter(Boolean)

  // Si hay UNA SOLA línea con varios "/" o "|", expandirla
  const lines: string[] = []
  for (const rl of rawLines) {
    const separadores = (rl.match(/[\/|]/g) ?? []).length
    if (separadores >= 2 && rl.length < 300) {
      lines.push(...rl.split(/[\/|]/).map(s => s.trim()).filter(Boolean))
    } else {
      lines.push(rl)
    }
  }

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
    const raw  = lines[i]
    const line = stripEmoji(raw)          // sin emoji decorativo al inicio
    const ln   = nc(line)

    // ── 1A. DIRECCIÓN FORMAL — va ANTES del bloque colon para que
    //        "Calle 47a BARRIO:Villa" no se interprete como clave:valor
    if (/^(cll|calle|cra|carrera|cr|kr|cl|av|avenida|tv|transv|transversal|diag|diagonal|via|variante|autopista|km|conj|conjunto|urb|urbanizacion|sector|interior|res\b)[\s.#]/i.test(line)) {
      // Normalizar "BARRIO:Xxx" y "BARRIO Xxx" dentro de la dirección
      const dirLimpia = line
        .replace(/\s+BARRIO\s*:\s*/gi, ', ')
        .replace(/\bBARRIO\b\s+/gi, '')
        .trim()
      direccion = dirLimpia; usado.add(i); continue
    }

    // ── 1B. PLANTILLA "clave: valor" ──────────────────────────────────────
    const ci = line.indexOf(':')
    if (ci > 0 && ci < 40) {
      const key    = nc(line.slice(0, ci))
      const val    = line.slice(ci + 1).trim()
      const valNc  = nc(val)
      const valNum = parseValor(val)

      if (['nombre', 'cliente', 'nombres', 'cliente nombre'].includes(key)) {
        if (val) cliente_nombre = val; usado.add(i); continue
      }
      if (['celular', 'telefono', 'tel', 'cel', 'whatsapp', 'numero', 'movil', 'contacto'].includes(key)) {
        const c = val.replace(/\D/g, '').replace(/^57/, '')  // quita prefijo 57
        const cel = c.match(/^3\d{9}$/) ? c : val.replace(/\D/g, '')
        if (cel) cliente_telefono = cel; usado.add(i); continue
      }
      if (['direccion', 'dir', 'address', 'dirección'].includes(key)) {
        if (val) direccion = val; usado.add(i); continue
      }
      if (key === 'mensajeria' || key === 'mensajería') {
        if (valNc.includes('exneider')) mensajeria = 'exneider'
        else if (valNc.includes('servigo')) mensajeria = 'servigo'
        usado.add(i); continue
      }
      if (['observaciones', 'observacion', 'notas', 'nota', 'indicaciones', 'comentarios', 'comentario'].includes(key)) {
        if (val) notas = notas ? `${notas} | ${val}` : val; usado.add(i); continue
      }
      if (key.startsWith('pedido o articulo') || ['articulo', 'articulos', 'articulo enviado', 'pedido', 'producto', 'productos', 'item'].includes(key)) {
        if (val) {
          const pm = val.match(/\b(TR|CR|SR)\d+\b/i)
          if (pm && !numero_pedido) numero_pedido = pm[0].toUpperCase()
          const resto = val.replace(/\b(TR|CR|SR)\d+\b\s*[\/|,-]?\s*/i, '').trim()
          if (resto && !articulo) articulo = resto
        }
        usado.add(i); continue
      }
      if (['valor a cobrar', 'valor', 'valor pedido', 'valor del pedido', 'precio', 'total', 'costo', 'vlr', 'vr'].includes(key)) {
        if (valNum === 0 || /no\s+cobrar|nada|gratis/.test(valNc)) { metodo_pago = 'transferencia' }
        else if (valNum <= 20000) { valor_domicilio = valNum }
        else { valor_pedido = valNum; metodo_pago = 'efectivo' }
        usado.add(i); continue
      }
      if (['valor domicilio', 'valor del domicilio', 'domicilio', 'domi', 'flete'].includes(key)) {
        valor_domicilio = valNum; usado.add(i); continue
      }
      // Claves a ignorar explícitamente (datos del pedido, no del domicilio)
      if (['fecha', 'asesor', 'talla', 'abono', 'anticipo', 'adelanto', 'referencia', 'ref',
           'ciudad', 'barrio', 'departamento', 'localidad', 'pais', 'color', 'separado',
           'saldo', 'entrega', 'sede', 'tipo', 'cc', 'cedula', 'c.c', 'documento', 'doc'].includes(key)) {
        usado.add(i); continue
      }
      // Clave desconocida → ignorar la línea completa
      usado.add(i); continue
    }

    // ── 1C. NÚMERO DE PEDIDO ───────────────────────────────────────────────
    if (/^\s*(TR|CR|SR)\d+\s*$/i.test(line)) {
      if (!numero_pedido) numero_pedido = line.trim().toUpperCase()
      usado.add(i); continue
    }
    const pm = line.match(/\b(TR|CR|SR)\d+\b/i)
    if (pm && !numero_pedido) numero_pedido = pm[0].toUpperCase()

    // ── 1D. CELULAR ────────────────────────────────────────────────────────
    // Acepta: 3XXXXXXXXX | +57 3XXXXXXXXX | 57 3XXXXXXXXX | 3XX-XXX-XXXX
    const celRaw = line.replace(/[\s\-().+]/g, '')
    const celClean = celRaw.startsWith('57') && celRaw.length === 12
      ? celRaw.slice(2)   // quitar código de país 57
      : celRaw
    if (/^3\d{9}$/.test(celClean) && !cliente_telefono) {
      cliente_telefono = celClean; usado.add(i); continue
    }

    // ── 1E. CÉDULA (ignorar) — case-insensitive ────────────────────────────
    if (/^(c\.?c\.?\s*:?\s*)?\d{7,11}$/i.test(line.replace(/[\s.]/g, '')) &&
        !line.replace(/\D/g, '').startsWith('3')) {
      usado.add(i); continue
    }

    // ── 1F. LÍNEAS A IGNORAR (datos del pedido) ────────────────────────────
    if (/^talla\s+\S+$/i.test(ln)) { usado.add(i); continue }
    if (/^(abono|anticipo|adelanto|valo[r]?|separado)\s+[\d.,]+$/i.test(ln)) { usado.add(i); continue }
    if (/^(color|talla|ref|referencia)\s*:\s*\S/i.test(ln)) { usado.add(i); continue }

    // ── 1G. MENSAJERÍA ────────────────────────────────────────────────────
    if (/^exneider\s*$/i.test(ln)) { mensajeria = 'exneider'; usado.add(i); continue }
    if (/^servigo\s*$/i.test(ln))  { mensajeria = 'servigo';  usado.add(i); continue }
    if (/exneider/.test(ln) && line.length < 30) { mensajeria = 'exneider'; usado.add(i); continue }
    if (/servigo/.test(ln)  && line.length < 30) { mensajeria = 'servigo';  usado.add(i); continue }

    // ── 1H. PAGO ──────────────────────────────────────────────────────────
    if (/no\s+cobrar|sin\s+cobro|gratis|ya\s+pag[oó]|ya\s+cancelo/.test(ln)) {
      cobrar_al_cliente = false; metodo_pago = 'transferencia'; usado.add(i); continue
    }
    if (/^(transferencia|nequi|daviplata|bancolombia|pse|consignacion)/.test(ln)) {
      metodo_pago = 'transferencia'; usado.add(i); continue
    }
    if (/^efectivo$/.test(ln)) { metodo_pago = 'efectivo'; usado.add(i); continue }

    // ── 1I. ARTÍCULO CON PREFIJO ──────────────────────────────────────────
    const artMatch = line.match(/^art[ií]culo\s*:?\s*(.+)$/i)
    if (artMatch && !articulo) { articulo = artMatch[1].trim(); usado.add(i); continue }

    // ── 1J. DIRECCIÓN CON # O "No." (sin prefijo de calle) ────────────────
    if (/(#|n[o°]\.?)\s*\d/i.test(line) && !direccion) {
      direccion = line; usado.add(i); continue
    }

    // ── 1K. VALOR NUMÉRICO SOLO EN LA LÍNEA ───────────────────────────────
    // "$150.000" | "150000" | "150,000"
    if (/^\$?\s*[\d.,]+\s*$/.test(line)) {
      const v = parseValor(line)
      if (v >= 1000 && v <= 20000 && !valor_domicilio) { valor_domicilio = v; usado.add(i); continue }
      if (v > 20000 && v <= 10000000 && !valor_pedido) { valor_pedido = v; metodo_pago = 'efectivo'; usado.add(i); continue }
    }

    // ── 1L. VALOR CON TEXTO (sin colon) — "precio 150000", "vr 99000" ─────
    const valorTextoMatch = ln.match(/^(precio|costo|total|cobrar|vlr|vr)\s+\$?([\d.,]+)$/)
    if (valorTextoMatch) {
      const v = parseValor(valorTextoMatch[2])
      if (v <= 20000 && !valor_domicilio) { valor_domicilio = v }
      else if (v > 20000 && !valor_pedido) { valor_pedido = v; metodo_pago = 'efectivo' }
      usado.add(i); continue
    }

    // ── 1M. "BARRIO xxx" SOLO EN LA LÍNEA ────────────────────────────────
    if (/^barrio\b/i.test(ln)) {
      const barrio = line.replace(/^barrio\s*/i, '').trim()
      if (barrio) {
        if (direccion) direccion = `${direccion}, ${barrio}`
        // Si no hay dirección aún, no consumir: espera a que la dirección aparezca en pass 2
        else { continue }   // no marcar como usado, revisitar en pasada 2
      }
      usado.add(i); continue
    }

    // ── 1N. ASESOR CONOCIDO → IGNORAR ─────────────────────────────────────
    if (Object.keys(ASESORES).some(k => ln === k || ln.startsWith(k + ' '))) {
      usado.add(i); continue
    }
  }

  // ── PASADA 2: líneas restantes → nombre, artículo y notas ────────────────
  for (let i = 0; i < lines.length; i++) {
    if (usado.has(i)) continue
    const line = stripEmoji(lines[i])
    const ln   = nc(line)

    // Indicaciones de entrega → notas
    if (/\b(dejar|entregar|llamar|llame|timbrar|preguntar|recibe|recibir|horario|porter[ií]a|portero|antes|despu[eé]s|entregar a|preguntar por|tocar)\b/i.test(line)) {
      notas = notas ? `${notas} | ${line}` : line; continue
    }

    // Nombre: sin dígitos, longitud razonable
    if (!cliente_nombre && !/\d/.test(line) && line.length >= 4 && line.length <= 60) {
      cliente_nombre = line; continue
    }

    // "Barrio xxx" pendiente → si ya tenemos dirección, append
    if (/^barrio\b/i.test(ln) && direccion) {
      const barrio = line.replace(/^barrio\s*/i, '').trim()
      if (barrio) direccion = `${direccion}, ${barrio}`
      continue
    }

    // Ciudad/barrio corto sin dígitos → complementa dirección
    if (direccion && !/\d/.test(line) && line.length <= 35 && line.split(/\s+/).length <= 4) {
      direccion = `${direccion}, ${line}`; continue
    }

    // Si ya tenemos nombre, teléfono y dirección pero no artículo,
    // una línea sin dígitos (o con pocos) puede ser el artículo
    if (!articulo && cliente_nombre && (cliente_telefono || direccion) &&
        line.length >= 3 && line.length <= 80 && !/^\d+$/.test(line)) {
      articulo = line; continue
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
