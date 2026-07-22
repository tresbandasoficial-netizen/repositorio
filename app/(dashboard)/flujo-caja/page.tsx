import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSesion } from '@/lib/auth/acceso'
import { createClient } from '@/lib/supabase/server'
import { formatCOP, formatFecha, hoyBogota } from '@/lib/utils/format'
import { EntregaEfectivoButton } from '@/components/flujo/EntregaEfectivoButton'
import { AgregarDineroButton } from '@/components/flujo/AgregarDineroButton'
import { PagoFinancieraButton } from '@/components/flujo/PagoFinancieraButton'
import { metodosDeSede } from '@/types'

// Addi/Sistecrédito pagan después (al mes): su saldo es plata POR COBRAR,
// no dinero disponible todavía. Bold (datáfono) sí entra de una — va con
// las cuentas normales.
const TIPOS_POR_COBRAR = ['addi', 'sistecredito']

type Cuenta = {
  id: string
  nombre: string
  tipo: string
  sede_id: string | null
  metodo_pago: string | null
  saldo_inicial: number
  fecha_corte: string | null
  orden: number
}

export default async function FlujoCajaPage({
  searchParams,
}: {
  searchParams: Promise<{ sede?: string }>
}) {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') redirect('/dashboard')

  const sp     = await searchParams
  const sedeId = sp.sede || null

  const supabase = await createClient()

  const { data: sedes } = await supabase
    .from('sedes')
    .select('id, codigo, nombre')
    .order('codigo')

  const { data: cuentasRaw } = await supabase
    .from('cuentas')
    .select('id, nombre, tipo, sede_id, metodo_pago, saldo_inicial, fecha_corte, orden')
    .eq('activa', true)
    .neq('tipo', 'credito')   // el crédito no es dinero real
    .order('orden')
  const cuentas = (cuentasRaw ?? []) as Cuenta[]

  // Fecha de corte mínima para acotar la consulta de movimientos.
  const cortes = cuentas.map(c => c.fecha_corte).filter(Boolean) as string[]
  const corteMin = cortes.length ? cortes.sort()[0] : hoyBogota()

  // Movimientos desde el corte (cada cuenta cuenta los suyos desde su fecha_corte).
  // Se excluye crédito (no es dinero) y pagos anulados (pedidos cancelados /
  // facturas anuladas — marcados anulado=true por la migración 076).
  const [pagosRes, pfRes, gastosRes, pmRes, traslRes] = await Promise.all([
    supabase.from('pagos').select('cuenta_id, monto, fecha').neq('metodo', 'credito').eq('anulado', false).gte('fecha', corteMin).limit(20000),
    supabase.from('pagos_factura').select('cuenta_id, monto, fecha').neq('metodo', 'credito').eq('anulado', false).gte('fecha', corteMin).limit(20000),
    supabase.from('gastos').select('cuenta_id, valor, fecha').gte('fecha', corteMin).limit(20000),
    supabase.from('pagos_mensajeria').select('cuenta_id, monto, fecha, tipo').eq('tipo', 'pago').gte('fecha', corteMin).limit(20000),
    supabase.from('traslados_caja').select('origen_cuenta_id, destino_cuenta_id, monto, fecha').gte('fecha', corteMin).limit(20000),
  ])

  const pagos    = (pagosRes.data  ?? []) as Array<{ cuenta_id: string | null; monto: number; fecha: string }>
  const pf       = (pfRes.data     ?? []) as Array<{ cuenta_id: string | null; monto: number; fecha: string }>
  const gastos   = (gastosRes.data ?? []) as Array<{ cuenta_id: string | null; valor: number; fecha: string }>
  const pm       = (pmRes.data     ?? []) as Array<{ cuenta_id: string | null; monto: number; fecha: string }>
  const traslados = (traslRes.data ?? []) as Array<{ origen_cuenta_id: string | null; destino_cuenta_id: string; monto: number; fecha: string }>

  // Saldo de cada cuenta = saldo_inicial + (ingresos − egresos) desde su corte.
  type Fila = Cuenta & { ingresos: number; egresos: number; saldo: number }
  const filas: Fila[] = cuentas.map(c => {
    const corte = c.fecha_corte || hoyBogota()
    let ingresos = 0, egresos = 0
    for (const p of pagos)  if (p.cuenta_id === c.id && p.fecha >= corte) ingresos += p.monto
    for (const p of pf)     if (p.cuenta_id === c.id && p.fecha >= corte) ingresos += p.monto
    for (const p of pm)     if (p.cuenta_id === c.id && p.fecha >= corte) ingresos += p.monto   // liquidaciones de mensajería
    for (const t of traslados) if (t.destino_cuenta_id === c.id && t.fecha >= corte) ingresos += t.monto
    for (const g of gastos) if (g.cuenta_id === c.id && g.fecha >= corte) egresos += g.valor
    for (const t of traslados) if (t.origen_cuenta_id === c.id && t.fecha >= corte) egresos += t.monto
    return { ...c, ingresos, egresos, saldo: c.saldo_inicial + ingresos - egresos }
  })

  // Filtro por sede: las cuentas propias de la sede + las que esa sede USA
  // según sus métodos de pago (igual que el cuadre). Así en Santa Rosa salen
  // Nequi Luisa, Addi, Sistecrédito y Bold — y las cuentas globales de bancos
  // (que son plata de Bucaramanga) solo aparecen en la pestaña Bucaramanga.
  // Se muestran TODAS las activas (aun en $0) para ver cuánto hay en cada una.
  const sedeCodigoFiltro = sedes?.find(s => s.id === sedeId)?.codigo
  const metodosSede = sedeCodigoFiltro ? new Set<string>(metodosDeSede(sedeCodigoFiltro)) : null
  const visibles = sedeId
    ? filas.filter(f =>
        f.sede_id === sedeId ||
        (f.sede_id === null && !!f.metodo_pago && metodosSede!.has(f.metodo_pago)))
    : filas

  const efectivo  = visibles.filter(f => f.tipo === 'efectivo')
  const porCobrar = visibles.filter(f => TIPOS_POR_COBRAR.includes(f.tipo))
  const otras     = visibles.filter(f => f.tipo !== 'efectivo' && !TIPOS_POR_COBRAR.includes(f.tipo))

  const totalEfectivo  = efectivo.reduce((s, f) => s + f.saldo, 0)
  const totalCuentas   = otras.reduce((s, f) => s + f.saldo, 0)
  const totalPorCobrar = porCobrar.reduce((s, f) => s + f.saldo, 0)
  // El total disponible NO incluye lo por cobrar: esa plata aún no ha entrado.
  const totalGeneral   = totalEfectivo + totalCuentas

  const sedeActual = sedes?.find(s => s.id === sedeId)

  // Cuentas para el selector de "Entrega de efectivo".
  const cuentasOpc = cuentas.map(c => ({ id: c.id, nombre: c.nombre, tipo: c.tipo }))

  function tabUrl(sid: string | null) {
    return sid ? `/flujo-caja?sede=${sid}` : '/flujo-caja'
  }

  // Cada cuenta en su CASILLA numerada: nombre, corte, entradas/salidas y el
  // saldo grande — más fácil de leer que la tabla corrida.
  const renderGrupo = (titulo: string, icono: string, filas: Fila[], total: number, esquema: 'verde' | 'azul' | 'naranja', nota?: string) => {
    if (filas.length === 0) return null
    const colores = esquema === 'verde'
      ? { chip: 'bg-green-600', titulo: 'text-green-800', borde: 'border-green-200', fondo: 'bg-green-50/60' }
      : esquema === 'naranja'
      ? { chip: 'bg-amber-600', titulo: 'text-amber-800', borde: 'border-amber-200', fondo: 'bg-amber-50/60' }
      : { chip: 'bg-blue-600', titulo: 'text-blue-800', borde: 'border-blue-200', fondo: 'bg-blue-50/60' }
    return (
      <div>
        <div className={`rounded-xl border ${colores.borde} ${colores.fondo} px-5 py-3 flex items-center justify-between gap-3 flex-wrap mb-3`}>
          <div>
            <p className={`text-sm font-bold ${colores.titulo}`}>{icono} {titulo} <span className="font-normal text-xs opacity-70">({filas.length} cuenta{filas.length !== 1 ? 's' : ''})</span></p>
            {nota && <p className="text-[11px] opacity-80 mt-0.5">{nota}</p>}
          </div>
          <p className="text-base font-bold text-gray-900">{formatCOP(total)}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {filas.map((f, i) => (
            <Link
              key={f.id}
              href={`/flujo-caja/${f.id}`}
              className={`block rounded-xl border p-4 transition-all hover:shadow-md hover:border-blue-300 ${
                f.saldo < 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-6 h-6 rounded-lg ${colores.chip} text-white text-xs font-bold flex items-center justify-center shrink-0`}>{i + 1}</span>
                <p className="text-sm font-bold text-gray-900 truncate">{f.nombre}</p>
                {f.sede_id === null && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 shrink-0" title="Cuenta global: recibe dinero de todas las sedes">global</span>
                )}
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5" title="Los ingresos/egresos se cuentan desde esta fecha (el saldo inicial ya absorbe lo anterior)">
                Corte {f.fecha_corte ? formatFecha(f.fecha_corte) : '—'} · Inicial {formatCOP(f.saldo_inicial)}
              </p>
              <div className="flex items-center gap-3 mt-1.5 text-xs">
                <span className="text-green-700 font-medium">{f.ingresos ? '+' + formatCOP(f.ingresos) : '+$ 0'}</span>
                <span className="text-red-600 font-medium">{f.egresos ? '−' + formatCOP(f.egresos) : '−$ 0'}</span>
              </div>
              <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between">
                <span className="text-[11px] text-gray-400 uppercase">Saldo actual</span>
                <span className={`text-lg font-bold ${f.saldo < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {formatCOP(f.saldo)}{f.saldo < 0 ? ' ⚠' : ''}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Flujo de caja</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {sedeActual ? sedeActual.nombre : 'Todas las sedes'} · cada cuenta suma desde su propio corte (columna Corte)
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <AgregarDineroButton cuentas={cuentasOpc} />
          <EntregaEfectivoButton cuentas={cuentasOpc} />
          <PagoFinancieraButton cuentas={cuentasOpc} />
        </div>
      </div>

      {/* Tabs de sede */}
      <div className="flex gap-2 flex-wrap">
        <Link href={tabUrl(null)}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
            !sedeId ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
          }`}>
          Todas
        </Link>
        {(sedes ?? []).map(s => (
          <Link key={s.id} href={tabUrl(s.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              sedeId === s.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}>
            {s.nombre}
          </Link>
        ))}
      </div>

      {/* Totales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-green-50 rounded-xl border border-green-200 p-5">
          <p className="text-xs text-green-700 uppercase font-semibold">💵 Efectivo</p>
          <p className="text-2xl font-bold text-green-800 mt-2">{formatCOP(totalEfectivo)}</p>
        </div>
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-5">
          <p className="text-xs text-blue-700 uppercase font-semibold">🏦 Cuentas</p>
          <p className="text-2xl font-bold text-blue-800 mt-2">{formatCOP(totalCuentas)}</p>
        </div>
        <div className="rounded-xl p-5 bg-blue-600">
          <p className="text-xs uppercase text-blue-100 font-semibold">Total disponible</p>
          <p className="text-2xl font-bold text-white mt-2">{formatCOP(totalGeneral)}</p>
          <p className="text-[10px] text-blue-200">efectivo + cuentas</p>
        </div>
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-5">
          <p className="text-xs text-amber-700 uppercase font-semibold">📋 Por cobrar</p>
          <p className="text-2xl font-bold text-amber-800 mt-2">{formatCOP(totalPorCobrar)}</p>
          <p className="text-[10px] text-amber-600">Addi · Sistecrédito (aún no consignan)</p>
        </div>
      </div>

      {visibles.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          No hay cuentas con saldo{sedeActual ? ` en ${sedeActual.codigo}` : ''}.
        </div>
      ) : (
        <div className="space-y-6">
          {renderGrupo('Efectivo', '💵', efectivo, totalEfectivo, 'verde')}
          {renderGrupo('Cuentas', '🏦', otras, totalCuentas, 'azul')}
          {renderGrupo('Por cobrar — financieras', '📋', porCobrar, totalPorCobrar, 'naranja',
            'Ventas por Addi y Sistecrédito que AÚN no te consignan. Cuando te paguen, usa "📋 Pago de financiera".')}
        </div>
      )}
    </div>
  )
}
