import { createClient } from '@/lib/supabase/server'
import { terminoBusquedaSeguro } from '@/lib/utils/busqueda'

const PAGE_SIZE = 30

// Clave para comparar direcciones escritas de formas distintas: sin acentos,
// sin espacios de más y en mayúsculas. Solo se usa para detectar repetidas;
// lo que se muestra es siempre el texto original.
function claveDireccion(dir: string): string {
  return dir
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

export type ClientesResult = {
  clientes: ClienteRow[]
  total: number
  pagina: number
  totalPaginas: number
}

export type ClienteRow = {
  id: string
  nombre: string
  telefono_normalizado: string
  cedula: string | null
  email: string | null
  notas: string | null
  creado_en: string
  cumple_dia: number | null
  cumple_mes: number | null
  total_pedidos: number
  ultimo_pedido: string | null
}

export type PagoCliente = {
  id: string
  fecha: string
  creado_en: string
  monto: number
  metodo: string
  notas: string | null
  origen: 'pedido' | 'factura'
  referencia: string  // numero_orden o numero_factura
  referencia_id: string
}

// Un abono puede repartirse entre varios pedidos/facturas (abonar_cliente). Las
// partes se agrupan por operación: comparten `creado_en` (misma transacción) y
// método. El total del abono es la suma de sus partes.
export type AbonoCliente = {
  fecha: string
  creado_en: string
  metodo: string
  total: number
  partes: PagoCliente[]
}

export type ClienteDetalle = {
  id: string
  nombre: string
  telefono_normalizado: string
  cedula: string | null
  email: string | null
  notas: string | null
  ciudad: string | null
  direccion: string | null
  creado_en: string
  cumple_dia: number | null
  cumple_mes: number | null
  // Direcciones usadas en los domicilios del cliente (la ficha solo guarda una)
  direcciones: Array<{
    direccion: string
    pedido: string
    pedido_id: string
    fecha: string
  }>
  pedidos: Array<{
    id: string
    numero_orden: string
    estado: string
    total: number
    total_pagado: number
    fecha_creacion: string
    sede_nombre: string
    asesor_nombre: string
    factura_id: string | null
  }>
  pagos: PagoCliente[]
  abonos: AbonoCliente[]
}

export async function getClientes(params?: {
  busqueda?: string
  pagina?: number
  sede_id?: string
}): Promise<ClientesResult> {
  const supabase = await createClient()
  const pagina = Math.max(1, params?.pagina ?? 1)
  const desde  = (pagina - 1) * PAGE_SIZE
  const hasta  = desde + PAGE_SIZE - 1

  // Con sede_id usamos inner join para traer solo clientes con pedidos en esa sede
  const pedidosSelect = params?.sede_id
    ? 'pedidos!inner(fecha_creacion, sede_id)'
    : 'pedidos(fecha_creacion)'

  let query = supabase
    .from('clientes')
    .select(`id, nombre, telefono_normalizado, cedula, email, notas, creado_en, cumple_dia, cumple_mes, ${pedidosSelect}`, { count: 'exact' })
    .order('nombre', { ascending: true })
    .range(desde, hasta)

  if (params?.sede_id) {
    query = query.eq('pedidos.sede_id', params.sede_id)
  }

  if (params?.busqueda) {
    const b = terminoBusquedaSeguro(params.busqueda)
    if (b) query = query.or(
      `nombre.ilike.%${b}%,telefono_normalizado.ilike.%${b}%,cedula.ilike.%${b}%`
    )
  }

  const { data, error, count } = await query
  // PGRST103: la página pedida quedó más allá del total (p.ej. filtró estando
  // en una página alta) — volver a la página 1.
  if (error?.message.includes('Requested range not satisfiable') && pagina > 1) {
    return getClientes({ ...params, pagina: 1 })
  }
  if (error) throw new Error(`Error cargando clientes: ${error.message}`)

  const total = count ?? 0
  return {
    clientes: (data ?? []).map((c: any) => ({
      id:                   c.id,
      nombre:               c.nombre,
      telefono_normalizado: c.telefono_normalizado,
      cedula:               c.cedula,
      email:                c.email,
      notas:                c.notas,
      creado_en:            c.creado_en,
      cumple_dia:           c.cumple_dia,
      cumple_mes:           c.cumple_mes,
      total_pedidos:        c.pedidos?.length ?? 0,
      ultimo_pedido:        c.pedidos?.length
        ? c.pedidos.sort((a: any, b: any) =>
            b.fecha_creacion.localeCompare(a.fecha_creacion)
          )[0].fecha_creacion
        : null,
    })),
    total,
    pagina,
    totalPaginas: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  }
}

export async function getClienteDetalle(id: string): Promise<ClienteDetalle | null> {
  const supabase = await createClient()

  const { data: cliente, error } = await supabase
    .from('clientes')
    .select('id, nombre, telefono_normalizado, cedula, email, notas, ciudad, direccion, creado_en, cumple_dia, cumple_mes')
    .eq('id', id)
    .single()

  if (error || !cliente) return null

  const { data: pedidosRaw } = await supabase
    .from('pedidos')
    .select(`
      id, numero_orden, estado, total, fecha_creacion, tipo_entrega, direccion_entrega,
      sede:sedes(nombre),
      asesor:usuarios(nombre),
      pagos(id, monto, metodo, fecha, notas, anulado, creado_en),
      facturas!factura_id(id, numero_factura, pagos_factura(id, monto, metodo, fecha, notas, anulado, creado_en))
    `)
    .eq('cliente_id', id)
    .neq('estado', 'cancelado')
    .order('fecha_creacion', { ascending: false })

  // Una misma factura puede agrupar varios pedidos. Sus pagos_factura deben
  // contarse UNA sola vez, no una vez por cada pedido vinculado (eso duplicaba
  // el total pagado y dejaba el saldo en negativo).
  const facturasContadas = new Set<string>()

  // El crédito es deuda del cliente, no pago: no reduce el saldo (igual que cartera).
  const esPago = (m: string) => m !== 'credito'

  const pedidos = (pedidosRaw ?? []).map((p: any) => {
    const pagos_activos = (p.pagos ?? []).filter((pg: any) => !pg.anulado && esPago(pg.metodo))
    const pagado_directo = pagos_activos.reduce((s: number, pg: any) => s + pg.monto, 0)
    const factura = Array.isArray(p.facturas) ? p.facturas[0] : p.facturas
    let pagado_factura = 0
    if (factura && !facturasContadas.has(factura.id)) {
      facturasContadas.add(factura.id)
      pagado_factura = (factura.pagos_factura ?? [])
        .filter((pf: any) => !pf.anulado && esPago(pf.metodo))
        .reduce((s: number, pf: any) => s + pf.monto, 0)
    }
    return {
      id:             p.id,
      numero_orden:   p.numero_orden,
      estado:         p.estado,
      total:          p.total,
      total_pagado:   pagado_directo + pagado_factura,
      fecha_creacion: p.fecha_creacion,
      sede_nombre:    p.sede?.nombre ?? '',
      asesor_nombre:  p.asesor?.nombre ?? '',
      factura_id:     factura?.id ?? null,
    }
  })

  // Historial de pagos: pagos de pedidos + pagos de facturas, ordenados por fecha desc.
  // Cada factura se procesa una sola vez aunque esté ligada a varios pedidos.
  const pagos: PagoCliente[] = []
  const facturasVistas = new Set<string>()
  for (const _p of pedidosRaw ?? []) {
    const p = _p as any
    for (const pg of (p.pagos ?? [])) {
      if (pg.anulado) continue
      pagos.push({
        id:            pg.id,
        fecha:         pg.fecha,
        creado_en:     pg.creado_en,
        monto:         pg.monto,
        metodo:        pg.metodo,
        notas:         pg.notas ?? null,
        origen:        'pedido',
        referencia:    p.numero_orden,
        referencia_id: p.id,
      })
    }
    const factura = Array.isArray(p.facturas) ? p.facturas[0] : p.facturas
    if (factura && !facturasVistas.has(factura.id)) {
      facturasVistas.add(factura.id)
      for (const pf of (factura.pagos_factura ?? [])) {
        if (pf.anulado) continue
        pagos.push({
          id:            pf.id,
          fecha:         pf.fecha,
          creado_en:     pf.creado_en,
          monto:         pf.monto,
          metodo:        pf.metodo,
          notas:         pf.notas ?? null,
          origen:        'factura',
          referencia:    factura.numero_factura ?? p.numero_orden,
          referencia_id: factura.id,
        })
      }
    }
  }
  pagos.sort((a, b) => b.fecha.localeCompare(a.fecha))

  // Agrupar las partes de un mismo abono (misma transacción = mismo creado_en).
  // Así un abono de 500 repartido en 220 + 280 se muestra como un solo abono.
  const grupos = new Map<string, AbonoCliente>()
  for (const pg of pagos) {
    const key = `${pg.creado_en}|${pg.metodo}`
    let g = grupos.get(key)
    if (!g) { g = { fecha: pg.fecha, creado_en: pg.creado_en, metodo: pg.metodo, total: 0, partes: [] }; grupos.set(key, g) }
    g.total += pg.monto
    g.partes.push(pg)
  }
  const abonos = [...grupos.values()].sort((a, b) => b.creado_en.localeCompare(a.creado_en))

  // ── Direcciones de entrega usadas en los pedidos ───────────────────────────
  // La ficha del cliente guarda una sola dirección, pero cada domicilio lleva
  // la suya. Se juntan las repetidas y, cuando una es parte de otra más
  // completa ("calle 100" dentro de "calle 100 Bucaramanga"), se deja la larga.
  // También se omite la que ya está en la ficha, para no mostrarla dos veces.
  const vistas = new Map<string, { direccion: string; clave: string; pedido: string; pedido_id: string; fecha: string }>()
  for (const _p of pedidosRaw ?? []) {
    const p = _p as any
    const dir = (p.direccion_entrega ?? '').trim()
    if (!dir) continue
    const clave = claveDireccion(dir)
    // pedidosRaw viene ordenado por fecha desc: el primero que entra es el más reciente
    if (!vistas.has(clave)) {
      vistas.set(clave, { direccion: dir, clave, pedido: p.numero_orden, pedido_id: p.id, fecha: p.fecha_creacion })
    }
  }
  const claveFicha = cliente.direccion ? claveDireccion(cliente.direccion) : null
  const candidatas = [...vistas.values()]
  const direcciones = candidatas
    .filter(a => !candidatas.some(b => b.clave.length > a.clave.length && b.clave.includes(a.clave)))
    .filter(a => !claveFicha || !claveFicha.includes(a.clave))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .map(({ clave: _clave, ...resto }) => resto)

  return { ...cliente, direcciones, pedidos, pagos, abonos }
}
