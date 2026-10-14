import { createAdminClient } from '@/lib/supabase/admin'
import { hoyBogota } from '@/lib/utils/format'
import { traerTodo } from '@/lib/utils/traerTodo'
import { terminoBusquedaSeguro } from '@/lib/utils/busqueda'
import { metodosDeSede } from '@/types'

// Consultas de SOLO LECTURA para el asistente de WhatsApp. No hay sesión de
// usuario en el webhook, así que usan el cliente de servicio; por eso solo se
// ejecutan para números autorizados (ver route.ts) y nunca escriben nada.
//
// Reglas de dinero (las mismas de las pantallas):
//  - Ventas = pedidos.total (no cancelados, sin saldo_anterior). Nunca facturas.total.
//  - Saldo de una cuenta = saldo_inicial + ingresos − egresos desde su fecha_corte.
//  - Toda consulta que pueda pasar de 1.000 filas usa traerTodo.

function sumarDias(fecha: string, n: number): string {
  const d = new Date(fecha + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// Medianoche de Bogotá (UTC−5) de una fecha YYYY-MM-DD, como instante UTC.
function inicioDiaBogota(fecha: string): string {
  return `${fecha}T05:00:00.000Z`
}

const FECHA_OK = /^\d{4}-\d{2}-\d{2}$/

export type Periodo = 'hoy' | 'ayer' | 'semana' | 'mes' | 'mes_pasado' | 'rango'

// Resuelve un período a fechas [desde, hasta] inclusivas (hora Bogotá).
export function resolverPeriodo(
  periodo: Periodo,
  desde?: string,
  hasta?: string,
): { desde: string; hasta: string; etiqueta: string } {
  const hoy = hoyBogota()
  switch (periodo) {
    case 'ayer': {
      const a = sumarDias(hoy, -1)
      return { desde: a, hasta: a, etiqueta: 'ayer' }
    }
    case 'semana':
      return { desde: sumarDias(hoy, -6), hasta: hoy, etiqueta: 'los últimos 7 días' }
    case 'mes':
      return { desde: hoy.slice(0, 8) + '01', hasta: hoy, etiqueta: 'este mes' }
    case 'mes_pasado': {
      const finMesPasado = sumarDias(hoy.slice(0, 8) + '01', -1)
      return { desde: finMesPasado.slice(0, 8) + '01', hasta: finMesPasado, etiqueta: 'el mes pasado' }
    }
    case 'rango':
      if (desde && hasta && FECHA_OK.test(desde) && FECHA_OK.test(hasta) && desde <= hasta) {
        return { desde, hasta, etiqueta: `del ${desde} al ${hasta}` }
      }
      return { desde: hoy, hasta: hoy, etiqueta: 'hoy' }
    default:
      return { desde: hoy, hasta: hoy, etiqueta: 'hoy' }
  }
}

type Sede = { id: string; codigo: string; nombre: string }

async function traerSedes(): Promise<Sede[]> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('sedes').select('id, codigo, nombre').order('codigo')
  return (data ?? []) as Sede[]
}

// Acepta código (TR/SR/CR) o parte del nombre ("bucaramanga", "santa rosa").
function buscarSede(sedes: Sede[], texto?: string): Sede | null {
  const t = (texto ?? '').trim().toLowerCase()
  if (!t) return null
  return sedes.find(s => s.codigo.toLowerCase() === t)
    ?? sedes.find(s => s.nombre.toLowerCase().includes(t) || t.includes(s.nombre.toLowerCase()))
    ?? null
}

// Ventas = pedidos.total, total y por sede.
export async function consultarVentas(periodo: Periodo, desde?: string, hasta?: string, sede?: string) {
  const p = resolverPeriodo(periodo, desde, hasta)
  const supabase = createAdminClient()
  const sedes = await traerSedes()
  const filtro = buscarSede(sedes, sede)
  if (sede && !filtro) return { error: `No conozco la sede "${sede}". Las sedes son: ${sedes.map(s => s.nombre).join(', ')}` }

  let q = supabase
    .from('pedidos')
    .select('total, sede_id', { count: 'exact' })
    .gte('fecha_creacion', inicioDiaBogota(p.desde))
    .lt('fecha_creacion', inicioDiaBogota(sumarDias(p.hasta, 1)))
    .neq('estado', 'cancelado')
    .neq('tipo', 'saldo_anterior')
    .order('id')
  if (filtro) q = q.eq('sede_id', filtro.id)
  const r = await traerTodo<{ total: number; sede_id: string | null }>(q)
  if (r.error) return { error: r.error.message }

  const total = r.data.reduce((s, x) => s + (x.total ?? 0), 0)
  const cantidad = r.data.length
  const porSede: Record<string, { ventas: number; total_cop: number }> = {}
  for (const x of r.data) {
    const nombre = sedes.find(s => s.id === x.sede_id)?.nombre ?? 'Sin sede'
    const f = porSede[nombre] ?? { ventas: 0, total_cop: 0 }
    f.ventas += 1
    f.total_cop += x.total ?? 0
    porSede[nombre] = f
  }
  return {
    periodo: p.etiqueta,
    desde: p.desde,
    hasta: p.hasta,
    sede: filtro?.nombre ?? 'todas',
    numero_de_ventas: cantidad,
    total_vendido_cop: total,
    ticket_promedio_cop: cantidad > 0 ? Math.round(total / cantidad) : 0,
    por_sede: porSede,
  }
}

export async function consultarGastos(periodo: Periodo, desde?: string, hasta?: string, sede?: string) {
  const p = resolverPeriodo(periodo, desde, hasta)
  const supabase = createAdminClient()
  const sedes = await traerSedes()
  const filtro = buscarSede(sedes, sede)
  if (sede && !filtro) return { error: `No conozco la sede "${sede}". Las sedes son: ${sedes.map(s => s.nombre).join(', ')}` }

  let q = supabase
    .from('gastos')
    .select('valor, categoria, sede_id')
    .gte('fecha', p.desde)
    .lte('fecha', p.hasta)
    .order('id')
  if (filtro) q = q.eq('sede_id', filtro.id)
  const r = await traerTodo<{ valor: number; categoria: string; sede_id: string | null }>(q)
  if (r.error) return { error: r.error.message }

  const porCategoria: Record<string, number> = {}
  const porSede: Record<string, number> = {}
  for (const g of r.data) {
    porCategoria[g.categoria] = (porCategoria[g.categoria] ?? 0) + g.valor
    const nombre = sedes.find(s => s.id === g.sede_id)?.nombre ?? 'Sin sede'
    porSede[nombre] = (porSede[nombre] ?? 0) + g.valor
  }
  return {
    periodo: p.etiqueta,
    sede: filtro?.nombre ?? 'todas',
    total_gastos_cop: r.data.reduce((s, g) => s + g.valor, 0),
    por_categoria_cop: porCategoria,
    por_sede_cop: porSede,
  }
}

// Stock actual (suma de movimientos de inventario) de los artículos que coincidan
// con el texto por nombre, marca o código, por talla y por sede.
export async function consultarStock(busqueda: string, sede?: string) {
  const t = terminoBusquedaSeguro(busqueda ?? '')
  if (!t) return { error: 'Falta decir qué artículo buscar' }
  const supabase = createAdminClient()
  const sedes = await traerSedes()
  const filtro = buscarSede(sedes, sede)
  if (sede && !filtro) return { error: `No conozco la sede "${sede}". Las sedes son: ${sedes.map(s => s.nombre).join(', ')}` }

  const { data: arts, error } = await supabase
    .from('articulos')
    .select('id, nombre, marca, codigo, precio_venta')
    .eq('activo', true)
    .or(`nombre.ilike.%${t}%,marca.ilike.%${t}%,codigo.ilike.%${t}%`)
    .limit(30)
  if (error) return { error: error.message }
  if (!arts || arts.length === 0) return { coincidencias: 0, articulos_con_stock: [] }

  const precio = new Map(arts.map(a => [a.id, a.precio_venta as number | null]))
  let q = supabase
    .from('vista_stock_por_sede')
    .select('articulo_id, nombre, marca, talla, sede_id, stock')
    .in('articulo_id', arts.map(a => a.id))
    .order('articulo_id').order('talla').order('sede_id')
  if (filtro) q = q.eq('sede_id', filtro.id)
  const stock = await traerTodo<{ articulo_id: string; nombre: string; marca: string; talla: string | null; sede_id: string | null; stock: number }>(q)
  if (stock.error) return { error: stock.error.message }

  // Una fila por artículo + talla, con las unidades de cada sede.
  const mapa = new Map<string, { nombre: string; marca: string; talla: string; unidades_total: number; por_sede: Record<string, number>; precio_venta_cop: number | null }>()
  for (const f of stock.data) {
    const key = `${f.articulo_id}:${f.talla ?? ''}`
    const fila = mapa.get(key) ?? {
      nombre: f.nombre, marca: f.marca, talla: f.talla ?? 'sin talla', unidades_total: 0, por_sede: {},
      precio_venta_cop: precio.get(f.articulo_id) ?? null,
    }
    fila.unidades_total += f.stock
    if (f.stock !== 0) {
      const nombre = sedes.find(s => s.id === f.sede_id)?.nombre ?? 'Central'
      fila.por_sede[nombre] = (fila.por_sede[nombre] ?? 0) + f.stock
    }
    mapa.set(key, fila)
  }
  const conStock = [...mapa.values()].filter(f => f.unidades_total > 0)
  return {
    sede: filtro?.nombre ?? 'todas',
    coincidencias: arts.length,
    articulos_con_stock: conStock.slice(0, 40),
    articulos_agotados_o_sin_movimiento: mapa.size - conStock.length,
  }
}

// Cartera: lo que los clientes deben. Con texto, filtra por nombre/teléfono/cédula.
export async function consultarCartera(busqueda?: string) {
  const supabase = createAdminClient()
  const todo = await traerTodo<{ saldo: number }>(
    supabase.from('vista_cartera_clientes').select('saldo').order('id'),
  )
  if (todo.error) return { error: todo.error.message }

  let q = supabase
    .from('vista_cartera_clientes')
    .select('nombre, saldo, saldo_entregado, saldo_proceso')
    .order('saldo', { ascending: false })
    .limit(10)
  const b = terminoBusquedaSeguro(busqueda ?? '')
  if (b) q = q.or(`nombre.ilike.%${b}%,telefono_normalizado.ilike.%${b}%,cedula.ilike.%${b}%`)
  const { data, error } = await q
  if (error) return { error: error.message }

  return {
    clientes_con_deuda: todo.data.length,
    cartera_total_cop: todo.data.reduce((s, x) => s + (x.saldo ?? 0), 0),
    [b ? 'resultado_busqueda' : 'mayores_deudores']: (data ?? []).map(c => ({
      nombre: c.nombre,
      debe_cop: c.saldo,
      de_eso_ya_entregado_cop: c.saldo_entregado,
    })),
  }
}

// Addi/Sistecrédito pagan después: su saldo es plata POR COBRAR, no disponible
// (igual que la pantalla Flujo de caja).
const TIPOS_POR_COBRAR = ['addi', 'sistecredito']

// Saldo de cada cuenta = saldo_inicial + ingresos − egresos desde su fecha_corte
// (misma regla que la pantalla Flujo de caja).
export async function consultarSaldos(sede?: string) {
  const supabase = createAdminClient()
  const sedes = await traerSedes()
  const filtro = buscarSede(sedes, sede)
  if (sede && !filtro) return { error: `No conozco la sede "${sede}". Las sedes son: ${sedes.map(s => s.nombre).join(', ')}` }

  const { data: cuentasRaw, error } = await supabase
    .from('cuentas')
    .select('id, nombre, tipo, sede_id, metodo_pago, saldo_inicial, fecha_corte')
    .eq('activa', true)
    .neq('tipo', 'credito')
    .order('orden')
  if (error) return { error: error.message }
  type Cuenta = { id: string; nombre: string; tipo: string; sede_id: string | null; metodo_pago: string | null; saldo_inicial: number; fecha_corte: string | null }
  let cuentas = (cuentasRaw ?? []) as Cuenta[]
  if (cuentas.length === 0) return { cuentas: [], total_disponible_cop: 0 }

  const hoy = hoyBogota()
  const cortes = cuentas.map(c => c.fecha_corte).filter(Boolean) as string[]
  const corteMin = cortes.length ? [...cortes].sort()[0] : hoy

  const [pagos, pf, gastos, pm, traslados] = await Promise.all([
    traerTodo<{ cuenta_id: string | null; monto: number; fecha: string }>(supabase.from('pagos').select('cuenta_id, monto, fecha').neq('metodo', 'credito').eq('anulado', false).gte('fecha', corteMin).order('id')),
    traerTodo<{ cuenta_id: string | null; monto: number; fecha: string }>(supabase.from('pagos_factura').select('cuenta_id, monto, fecha').neq('metodo', 'credito').eq('anulado', false).gte('fecha', corteMin).order('id')),
    traerTodo<{ cuenta_id: string | null; valor: number; fecha: string }>(supabase.from('gastos').select('cuenta_id, valor, fecha').gte('fecha', corteMin).order('id')),
    traerTodo<{ cuenta_id: string | null; monto: number; fecha: string }>(supabase.from('pagos_mensajeria').select('cuenta_id, monto, fecha').eq('tipo', 'pago').gte('fecha', corteMin).order('id')),
    traerTodo<{ origen_cuenta_id: string | null; destino_cuenta_id: string | null; monto: number; fecha: string }>(supabase.from('traslados_caja').select('origen_cuenta_id, destino_cuenta_id, monto, fecha').gte('fecha', corteMin).order('id')),
  ])
  const fallo = [pagos, pf, gastos, pm, traslados].find(r => r.error)
  if (fallo?.error) return { error: fallo.error.message }

  const filas = cuentas.map(c => {
    const corte = c.fecha_corte || hoy
    let saldo = c.saldo_inicial
    for (const p of pagos.data) if (p.cuenta_id === c.id && p.fecha >= corte) saldo += p.monto
    for (const p of pf.data) if (p.cuenta_id === c.id && p.fecha >= corte) saldo += p.monto
    for (const p of pm.data) if (p.cuenta_id === c.id && p.fecha >= corte) saldo += p.monto
    for (const t of traslados.data) {
      if (t.destino_cuenta_id === c.id && t.fecha >= corte) saldo += t.monto
      if (t.origen_cuenta_id === c.id && t.fecha >= corte) saldo -= t.monto
    }
    for (const g of gastos.data) if (g.cuenta_id === c.id && g.fecha >= corte) saldo -= g.valor
    return { ...c, saldo }
  })

  // Con sede: sus cuentas propias + las globales que esa sede usa según sus métodos de pago.
  let visibles = filas
  if (filtro) {
    const metodos = new Set<string>(metodosDeSede(filtro.codigo))
    visibles = filas.filter(f => f.sede_id === filtro.id || (f.sede_id === null && !!f.metodo_pago && metodos.has(f.metodo_pago)))
  }
  const disponibles = visibles.filter(f => !TIPOS_POR_COBRAR.includes(f.tipo))
  const porCobrar = visibles.filter(f => TIPOS_POR_COBRAR.includes(f.tipo))
  const fmt = (f: typeof visibles[number]) => ({
    cuenta: f.nombre,
    sede: sedes.find(s => s.id === f.sede_id)?.nombre ?? 'global',
    saldo_cop: f.saldo,
  })
  return {
    sede: filtro?.nombre ?? 'todas',
    cuentas_disponibles: disponibles.map(fmt),
    total_disponible_cop: disponibles.reduce((s, f) => s + f.saldo, 0),
    por_cobrar_financieras: porCobrar.map(fmt),
    total_por_cobrar_cop: porCobrar.reduce((s, f) => s + f.saldo, 0),
  }
}

export async function consultarComprasRecientes(cantidad = 5) {
  const supabase = createAdminClient()
  const n = Math.min(Math.max(Math.round(cantidad) || 5, 1), 15)
  const { data, error } = await supabase
    .from('compras')
    .select('proveedor, fecha, total_cop, numero_factura')
    .order('fecha', { ascending: false })
    .order('creado_en', { ascending: false })
    .limit(n)
  if (error) return { error: error.message }
  return { compras: data ?? [] }
}

// Números autorizados para hablar con el asistente: tabla `configuracion`,
// clave `whatsapp_autorizados`, valor = números con indicativo separados por coma.
export async function numerosAutorizados(): Promise<string[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('configuracion')
    .select('valor')
    .eq('clave', 'whatsapp_autorizados')
    .maybeSingle()
  return String(data?.valor ?? '')
    .split(/[,\s;]+/)
    .map(n => n.replace(/\D/g, ''))
    .filter(Boolean)
}
