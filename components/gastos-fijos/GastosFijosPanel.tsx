'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatCOP } from '@/lib/utils/format'
import { guardarGastoFijoAction, eliminarGastoFijoAction, marcarPagoGastoFijoAction } from '@/app/actions/gastos-fijos'
import { Button } from '@/components/ui/Button'
import { Pencil, Trash2, Plus, X, Check, Wallet, CalendarDays, Receipt, Target, TrendingUp, SlidersHorizontal } from 'lucide-react'

interface GastoFijo {
  id: string
  concepto: string
  monto: number
  activo: boolean
}

interface Props {
  gastos: GastoFijo[]
  totalFijos: number
  puntoEquilibrio: number
  ventasMes: number
  gastosVariablesMes: number
  diasMes: number
  margenBruto: number
  diaDelMes: number
  diasCalendario: number
  // Sede activa: los gastos nuevos se crean en ella. null = pestaña "Todo el
  // negocio" (solo lectura de la lista, se agrega desde la pestaña de la sede).
  sedeId: string | null
  sedeNombre: string
  // Ganancia del mes: la REAL (pedidos con costo de compra asignado) y la
  // estimada con el margen para lo que aún no tiene costo.
  utilidadRealMes: number
  utilidadEstimadaMes: number
  ventaSinCostoMes: number
  // Gastos fijos ya marcados como pagados este mes + el mes ('YYYY-MM-01')
  pagadosIds: string[]
  mesActual: string
  // Ganancia con costo que aún NO se cuenta en la principal: entregado sin
  // pagar del todo, y pedidos todavía en camino.
  utilidadPorCobrarMes: number
  utilidadEnCaminoMes: number
  // Detalle por pedido de cada bolsillo (para desplegar y ver cuáles son).
  pedidosCobrados: Array<{ numero: string; utilidad: number }>
  pedidosPorCobrar: Array<{ numero: string; utilidad: number }>
  pedidosEnCamino: Array<{ numero: string; utilidad: number }>
}

// ── KPI card principal (gradiente, estilo dashboard) ─────────────────────────
function KpiHero({ label, valor, sub, icon: Icon }: {
  label: string; valor: string; sub?: string; icon: React.ElementType
}) {
  return (
    <div className="bg-gradient-to-br from-blue-600 to-blue-500 rounded-3xl p-5 text-white relative overflow-hidden shadow-lg shadow-blue-200">
      <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/10" />
      <div className="absolute -right-8 top-8 w-16 h-16 rounded-full bg-white/5" />
      <div className="relative">
        <div className="flex items-start justify-between mb-3">
          <p className="text-sm font-semibold text-blue-100">{label}</p>
          <div className="w-9 h-9 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
            <Icon size={17} className="text-white" />
          </div>
        </div>
        <p className="text-3xl font-bold tracking-tight mb-1">{valor}</p>
        {sub && <p className="text-sm text-blue-200">{sub}</p>}
      </div>
    </div>
  )
}

// ── KPI card secundaria (blanca, estilo dashboard) ───────────────────────────
function KpiCard({ label, valor, sub, icon: Icon, iconColor = 'text-blue-600', iconBg = 'bg-blue-50' }: {
  label: string; valor: string; sub?: string; icon: React.ElementType; iconColor?: string; iconBg?: string
}) {
  return (
    <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 relative overflow-hidden">
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm font-semibold text-gray-500">{label}</p>
        <div className={`w-9 h-9 rounded-2xl ${iconBg} flex items-center justify-center shrink-0`}>
          <Icon size={17} className={iconColor} />
        </div>
      </div>
      <p className="text-3xl font-bold tracking-tight mb-1 text-gray-900">{valor}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

// ── Tarjeta con encabezado (estilo TableCard del dashboard) ──────────────────
function SectionCard({ title, icon: Icon, children, headerRight }: {
  title: string; icon?: React.ElementType; children: React.ReactNode; headerRight?: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
          {Icon && (
            <span className="w-7 h-7 rounded-xl bg-blue-50 flex items-center justify-center">
              <Icon size={14} className="text-blue-600" />
            </span>
          )}
          {title}
        </h2>
        {headerRight}
      </div>
      {children}
    </div>
  )
}

export function GastosFijosPanel({ gastos, totalFijos, puntoEquilibrio, ventasMes, gastosVariablesMes, diasMes, margenBruto, diaDelMes, diasCalendario, sedeId, sedeNombre, utilidadRealMes, utilidadEstimadaMes, ventaSinCostoMes, pagadosIds, mesActual, utilidadPorCobrarMes, utilidadEnCaminoMes, pedidosCobrados, pedidosPorCobrar, pedidosEnCamino }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Gastos ya pagados este mes. Estado local optimista: el check se pinta de
  // una y si el servidor falla se revierte.
  const [pagados, setPagados] = useState<Set<string>>(() => new Set(pagadosIds))

  function togglePago(g: GastoFijo) {
    const nuevo = !pagados.has(g.id)
    setPagados(prev => {
      const s = new Set(prev)
      if (nuevo) s.add(g.id); else s.delete(g.id)
      return s
    })
    startTransition(async () => {
      const res = await marcarPagoGastoFijoAction({ gasto_fijo_id: g.id, mes: mesActual, pagado: nuevo })
      if (!res.ok) {
        setError(res.error)
        setPagados(prev => {
          const s = new Set(prev)
          if (nuevo) s.delete(g.id); else s.add(g.id)
          return s
        })
      }
    })
  }

  // Edición inline: id del gasto en edición (o 'nuevo' para el formulario de agregar)
  const [editando, setEditando] = useState<string | null>(null)
  const [concepto, setConcepto] = useState('')
  const [monto, setMonto] = useState('')

  // Avance con GANANCIA, no con ventas: la utilidad real del mes (pedido por
  // pedido, con sus costos de compra) + la estimada de lo que falta por costear
  // contra los gastos fijos. Cubierto = la ganancia ya paga los fijos.
  // Interactivo: los bolsillos "por cobrar" y "en camino" se prenden y apagan
  // para ver cómo quedaría el avance contándolos. Lo cobrado siempre cuenta.
  const [incluirPorCobrar, setIncluirPorCobrar] = useState(false)
  const [incluirEnCamino, setIncluirEnCamino] = useState(false)
  const [detalleAbierto, setDetalleAbierto] = useState<null | 'cobrada' | 'porCobrar' | 'enCamino'>(null)

  const utilidadMes = utilidadRealMes + utilidadEstimadaMes
    + (incluirPorCobrar ? utilidadPorCobrarMes : 0)
    + (incluirEnCamino ? utilidadEnCaminoMes : 0)
  const pctCubierto = totalFijos > 0 ? Math.min(100, (utilidadMes / totalFijos) * 100) : 0
  const faltanteUtilidad = Math.max(0, totalFijos - utilidadMes)
  const faltanteVentas = margenBruto > 0 ? Math.ceil(faltanteUtilidad / margenBruto) : 0
  const cubierto = totalFijos > 0 && utilidadMes >= totalFijos

  // Barra por segmentos: verde = cobrado, rojo = por cobrar, ámbar = en camino.
  const segmentos = [
    { v: utilidadRealMes, cls: 'bg-gradient-to-r from-green-500 to-emerald-400' },
    ...(incluirPorCobrar ? [{ v: utilidadPorCobrarMes, cls: 'bg-gradient-to-r from-red-400 to-rose-400' }] : []),
    ...(incluirEnCamino ? [{ v: utilidadEnCaminoMes, cls: 'bg-gradient-to-r from-amber-400 to-yellow-400' }] : []),
  ]
  let acumuladoPct = 0
  const segmentosPct = segmentos.map(s => {
    const pct = totalFijos > 0 ? Math.max(0, Math.min(100 - acumuladoPct, (s.v / totalFijos) * 100)) : 0
    acumuladoPct += pct
    return { ...s, pct }
  })

  const detalles: Record<'cobrada' | 'porCobrar' | 'enCamino', Array<{ numero: string; utilidad: number }>> = {
    cobrada: pedidosCobrados, porCobrar: pedidosPorCobrar, enCamino: pedidosEnCamino,
  }

  // ── Simulador interactivo ──────────────────────────────────────────────────
  const [simVentas, setSimVentas] = useState(400_000_000)
  const [simMargen, setSimMargen] = useState(Math.round(margenBruto * 1000) / 10) // en %
  const [simBonos, setSimBonos] = useState(3_000_000)
  const simBruta = Math.round(simVentas * (simMargen / 100))
  const simNeta = simBruta - totalFijos - simBonos
  const simEquilibrio = simMargen > 0 ? Math.ceil((totalFijos + simBonos) / (simMargen / 100)) : 0


  function abrirEdicion(g: GastoFijo | null) {
    setError(null)
    if (g) {
      setEditando(g.id)
      setConcepto(g.concepto)
      setMonto(String(g.monto))
    } else {
      setEditando('nuevo')
      setConcepto('')
      setMonto('')
    }
  }

  function guardar() {
    const montoNum = parseInt(monto.replace(/\D/g, ''), 10) || 0
    startTransition(async () => {
      const res = await guardarGastoFijoAction({
        id: editando === 'nuevo' ? undefined : editando!,
        concepto,
        monto: montoNum,
        sede_id: editando === 'nuevo' ? sedeId : undefined,
      })
      if (!res.ok) { setError(res.error); return }
      setEditando(null)
      router.refresh()
    })
  }

  function eliminar(id: string, nombre: string) {
    if (!confirm(`¿Eliminar el gasto fijo "${nombre}"?`)) return
    startTransition(async () => {
      const res = await eliminarGastoFijoAction(id)
      if (!res.ok) { setError(res.error); return }
      router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      {/* KPIs estilo dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiHero
          label="Hay que vender (mes)"
          valor={formatCOP(puntoEquilibrio)}
          sub={`Punto de equilibrio · margen ${(margenBruto * 100).toFixed(1)}%`}
          icon={Target}
        />
        <KpiCard
          label="Gastos fijos / mes"
          valor={formatCOP(totalFijos)}
          sub={`${gastos.filter(g => g.activo).length} conceptos`}
          icon={Wallet}
          iconColor="text-red-500"
          iconBg="bg-red-50"
        />
        <KpiCard
          label={`Por día (${diasMes} días)`}
          valor={formatCOP(Math.ceil(puntoEquilibrio / diasMes))}
          sub="Venta diaria para cubrir los fijos"
          icon={CalendarDays}
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
        />
        <KpiCard
          label="Gastos variables del mes"
          valor={formatCOP(gastosVariablesMes)}
          sub="Sin nómina, arriendo ni mercancía"
          icon={Receipt}
          iconColor="text-purple-600"
          iconBg="bg-purple-50"
        />
      </div>

      {/* Avance y simulador lado a lado en pantallas anchas */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
      {/* Avance del mes contra el punto de equilibrio */}
      <SectionCard title={`Avance del mes — ${sedeNombre}`} icon={TrendingUp} headerRight={
        <span className={`text-sm font-bold ${cubierto ? 'text-green-600' : 'text-gray-500'}`}>
          {pctCubierto.toFixed(0)}% de los fijos cubiertos
        </span>
      }>
        <div className="p-5 space-y-3">
          <div className="flex items-baseline justify-between">
            <p className="text-2xl font-bold tracking-tight text-gray-900 tabular-nums transition-all">{formatCOP(utilidadMes)}</p>
            <p className="text-xs text-gray-400">
              {incluirPorCobrar || incluirEnCamino ? 'cobrado + lo incluido abajo' : 'ganancia COBRADA del mes'}
            </p>
          </div>
          {/* Barra por segmentos: verde cobrado · rojo por cobrar · ámbar en camino */}
          <div className="h-3.5 bg-gray-100 rounded-full overflow-hidden flex">
            {segmentosPct.map((s, i) => (
              <div key={i} className={`h-full transition-all duration-500 ${s.cls}`} style={{ width: `${s.pct}%` }} />
            ))}
          </div>
          <p className="text-xs text-gray-500">
            Solo pedidos <strong>entregados y pagados</strong> con <strong>costo de compra asignado</strong>{' '}
            (las ventas de entrega inmediata entran aquí). Ventas del mes: {formatCOP(ventasMes)}.
            Toca un bolsillo para sumarlo a la cuenta o ver sus pedidos:
          </p>

          {/* Bolsillos interactivos */}
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              onClick={() => setDetalleAbierto(d => d === 'cobrada' ? null : 'cobrada')}
              className="rounded-lg bg-green-50 border border-green-200 px-2.5 py-1.5 text-green-800 font-medium hover:bg-green-100 transition-colors"
            >
              ● Cobrado: {formatCOP(utilidadRealMes)} <span className="text-green-500">{detalleAbierto === 'cobrada' ? '▴' : '▾'}</span>
            </button>
            {utilidadPorCobrarMes > 0 && (
              <span className={`inline-flex items-stretch rounded-lg border overflow-hidden transition-colors ${incluirPorCobrar ? 'border-red-400 ring-1 ring-red-300' : 'border-red-100'}`}>
                <button
                  type="button"
                  onClick={() => setIncluirPorCobrar(v => !v)}
                  title={incluirPorCobrar ? 'Quitar de la cuenta' : 'Sumar a la cuenta'}
                  className={`px-2.5 py-1.5 font-medium transition-colors ${incluirPorCobrar ? 'bg-red-500 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100'}`}
                >
                  {incluirPorCobrar ? '✓' : '+'} {formatCOP(utilidadPorCobrarMes)} entregados por cobrar
                </button>
                <button
                  type="button"
                  onClick={() => setDetalleAbierto(d => d === 'porCobrar' ? null : 'porCobrar')}
                  className={`px-2 transition-colors ${incluirPorCobrar ? 'bg-red-400 text-white' : 'bg-red-50 text-red-500 hover:bg-red-100'}`}
                >
                  {detalleAbierto === 'porCobrar' ? '▴' : '▾'}
                </button>
              </span>
            )}
            {utilidadEnCaminoMes > 0 && (
              <span className={`inline-flex items-stretch rounded-lg border overflow-hidden transition-colors ${incluirEnCamino ? 'border-amber-400 ring-1 ring-amber-300' : 'border-amber-100'}`}>
                <button
                  type="button"
                  onClick={() => setIncluirEnCamino(v => !v)}
                  title={incluirEnCamino ? 'Quitar de la cuenta' : 'Sumar a la cuenta'}
                  className={`px-2.5 py-1.5 font-medium transition-colors ${incluirEnCamino ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}
                >
                  {incluirEnCamino ? '✓' : '+'} {formatCOP(utilidadEnCaminoMes)} en camino
                </button>
                <button
                  type="button"
                  onClick={() => setDetalleAbierto(d => d === 'enCamino' ? null : 'enCamino')}
                  className={`px-2 transition-colors ${incluirEnCamino ? 'bg-amber-400 text-white' : 'bg-amber-50 text-amber-500 hover:bg-amber-100'}`}
                >
                  {detalleAbierto === 'enCamino' ? '▴' : '▾'}
                </button>
              </span>
            )}
          </div>

          {/* Detalle desplegable: los pedidos del bolsillo elegido */}
          {detalleAbierto && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 max-h-52 overflow-y-auto">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">
                {detalleAbierto === 'cobrada' ? `Pedidos cobrados (${detalles.cobrada.length})`
                  : detalleAbierto === 'porCobrar' ? `Entregados aún por cobrar (${detalles.porCobrar.length})`
                  : `Con costo aún sin entregar (${detalles.enCamino.length})`}
              </p>
              {detalles[detalleAbierto].length === 0 ? (
                <p className="text-xs text-gray-400">No hay pedidos aquí.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                  {detalles[detalleAbierto].map(p => (
                    <Link
                      key={p.numero}
                      href={`/pedidos?q=${encodeURIComponent(p.numero)}`}
                      className="flex items-center justify-between text-xs py-0.5 hover:bg-white rounded px-1 transition-colors"
                    >
                      <span className="font-mono text-gray-700">{p.numero}</span>
                      <span className="tabular-nums font-semibold text-gray-800">{formatCOP(p.utilidad)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
          {utilidadEstimadaMes === 0 && ventaSinCostoMes > 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
              ⚠ Hay {formatCOP(ventaSinCostoMes)} vendidos este mes <strong>sin costo de compra asignado</strong> — esa
              ganancia no se cuenta hasta que se les asigne su compra.
            </p>
          )}
          {cubierto ? (
            <div className="bg-green-50 border border-green-100 rounded-2xl px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-green-700">
                Lo tuyo después de los gastos fijos
              </p>
              <p className="text-2xl font-bold text-green-700 tabular-nums">{formatCOP(utilidadMes - totalFijos)}</p>
              <p className="text-xs text-green-800/70">
                Ganancia del mes ({formatCOP(utilidadMes)}) menos gastos fijos ({formatCOP(totalFijos)}) — utilidad limpia hasta hoy.
              </p>
            </div>
          ) : (
            <p className="text-xs text-gray-500">
              Faltan {formatCOP(faltanteUtilidad)} de ganancia (~{formatCOP(faltanteVentas)} en ventas) para cubrir los fijos.
            </p>
          )}
          {utilidadMes > 0 && diaDelMes >= 2 && (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3">
              <div className="w-9 h-9 rounded-2xl bg-blue-100 flex items-center justify-center shrink-0">
                <TrendingUp size={16} className="text-blue-600" />
              </div>
              <p className="text-xs text-gray-600">
                Al ritmo actual (día {diaDelMes} de {diasCalendario}), la ganancia del mes cerraría en{' '}
                <strong className="text-gray-900">{formatCOP(Math.round((utilidadMes / diaDelMes) * diasCalendario))}</strong>
                {(utilidadMes / diaDelMes) * diasCalendario >= totalFijos
                  ? <> — quedarían{' '}
                      <strong className="text-green-700">
                        {formatCOP(Math.round((utilidadMes / diaDelMes) * diasCalendario) - totalFijos)}
                      </strong>{' '}
                      limpios después de los fijos.</>
                  : ' — por debajo de los gastos fijos, hay que apretar.'}
              </p>
            </div>
          )}
        </div>
      </SectionCard>

      {/* Simulador */}
      <SectionCard title="Simulador — ¿y si este mes vendemos…?" icon={SlidersHorizontal}>
        <div className="p-5 space-y-4">
          <div className="flex items-baseline gap-4">
            <span className="text-3xl font-bold tracking-tight text-blue-600 tabular-nums w-44 shrink-0">{formatCOP(simVentas)}</span>
            <input
              type="range" min={0} max={800_000_000} step={10_000_000}
              value={simVentas} onChange={e => setSimVentas(Number(e.target.value))}
              className="flex-1 accent-blue-600"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-gray-50 rounded-2xl px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Utilidad bruta ({simMargen}%)</p>
              <p className="font-bold text-gray-900 tabular-nums text-lg">{formatCOP(simBruta)}</p>
            </div>
            <div className="bg-gray-50 rounded-2xl px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Gastos fijos</p>
              <p className="font-bold text-gray-900 tabular-nums text-lg">−{formatCOP(totalFijos)}</p>
            </div>
            <div className="bg-gray-50 rounded-2xl px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Bonos</p>
              <p className="font-bold text-gray-900 tabular-nums text-lg">−{formatCOP(simBonos)}</p>
            </div>
            <div className={`rounded-2xl px-4 py-3 ${simNeta >= 0 ? 'bg-gradient-to-br from-green-500 to-emerald-500 text-white' : 'bg-gradient-to-br from-red-500 to-rose-500 text-white'}`}>
              <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">Nos queda</p>
              <p className="font-bold tabular-nums text-lg">
                {simNeta < 0 ? '−' : ''}{formatCOP(Math.abs(simNeta))}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-gray-600">
            <label className="flex items-center gap-2">
              Margen
              <input
                type="range" min={15} max={45} step={0.5}
                value={simMargen} onChange={e => setSimMargen(Number(e.target.value))}
                className="w-28 accent-blue-600"
              />
              <strong className="tabular-nums">{simMargen}%</strong>
            </label>
            <label className="flex items-center gap-2">
              Bonos a pagar
              <input
                type="range" min={0} max={9_000_000} step={500_000}
                value={simBonos} onChange={e => setSimBonos(Number(e.target.value))}
                className="w-28 accent-blue-600"
              />
              <strong className="tabular-nums">{formatCOP(simBonos)}</strong>
            </label>
            <span>
              Con estos supuestos, el equilibrio (fijos + bonos) está en <strong>{formatCOP(simEquilibrio)}</strong>
            </span>
          </div>
        </div>
      </SectionCard>
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">{error}</p>
      )}

      {/* Lista de gastos fijos (el Agregar solo en la pestaña de una sede) */}
      <SectionCard title={`Gastos fijos — ${sedeNombre}`} icon={Wallet} headerRight={
        <div className="flex items-center gap-3">
          <span className={`text-xs font-semibold ${gastos.filter(g => g.activo && pagados.has(g.id)).length === gastos.filter(g => g.activo).length && gastos.length > 0 ? 'text-green-600' : 'text-gray-400'}`}>
            {gastos.filter(g => g.activo && pagados.has(g.id)).length} de {gastos.filter(g => g.activo).length} pagados este mes
          </span>
          {editando !== 'nuevo' && sedeId && (
            <Button variant="secondary" onClick={() => abrirEdicion(null)} className="text-xs !py-1.5">
              <Plus size={14} className="mr-1" /> Agregar
            </Button>
          )}
        </div>
      }>
        <div className="divide-y divide-gray-50">
          {gastos.map(g => (
            <div key={g.id} className={`flex items-center gap-2 px-5 py-3 ${pagados.has(g.id) ? 'bg-green-50/60' : ''}`}>
              {editando === g.id ? (
                <>
                  <input
                    value={concepto}
                    onChange={e => setConcepto(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    value={monto}
                    onChange={e => setMonto(e.target.value)}
                    inputMode="numeric"
                    className="w-32 border border-gray-200 rounded-xl px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button onClick={guardar} disabled={pending} className="p-1.5 text-green-600 hover:bg-green-50 rounded-xl">
                    <Check size={16} />
                  </button>
                  <button onClick={() => setEditando(null)} className="p-1.5 text-gray-400 hover:bg-gray-50 rounded-xl">
                    <X size={16} />
                  </button>
                </>
              ) : (
                <>
                  {/* Check "ya se pagó este mes" — se guarda por mes en la BD */}
                  <button
                    onClick={() => togglePago(g)}
                    disabled={pending}
                    title={pagados.has(g.id) ? 'Pagado este mes — clic para desmarcar' : 'Marcar como pagado este mes'}
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                      pagados.has(g.id)
                        ? 'bg-green-500 border-green-500 text-white'
                        : 'border-gray-300 text-transparent hover:border-green-400'
                    }`}
                  >
                    <Check size={13} strokeWidth={3} />
                  </button>
                  <span className={`flex-1 text-sm font-medium ${pagados.has(g.id) ? 'text-green-800' : 'text-gray-700'}`}>
                    {g.concepto}
                    {pagados.has(g.id) && (
                      <span className="ml-2 text-[10px] font-bold uppercase tracking-wide bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                        Pagado
                      </span>
                    )}
                  </span>
                  <span className={`text-sm font-bold tabular-nums ${pagados.has(g.id) ? 'text-green-700' : 'text-gray-900'}`}>{formatCOP(g.monto)}</span>
                  <button onClick={() => abrirEdicion(g)} className="p-1.5 text-gray-300 hover:text-blue-600 hover:bg-blue-50 rounded-xl">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => eliminar(g.id, g.concepto)} disabled={pending} className="p-1.5 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-xl">
                    <Trash2 size={15} />
                  </button>
                </>
              )}
            </div>
          ))}

          {editando === 'nuevo' && (
            <div className="flex items-center gap-2 px-5 py-3 bg-blue-50/40">
              <input
                value={concepto}
                onChange={e => setConcepto(e.target.value)}
                placeholder="Concepto (ej. Seguro moto)"
                className="flex-1 border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <input
                value={monto}
                onChange={e => setMonto(e.target.value)}
                inputMode="numeric"
                placeholder="Monto"
                className="w-32 border border-gray-200 rounded-xl px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button onClick={guardar} disabled={pending} className="p-1.5 text-green-600 hover:bg-green-50 rounded-xl">
                <Check size={16} />
              </button>
              <button onClick={() => setEditando(null)} className="p-1.5 text-gray-400 hover:bg-gray-50 rounded-xl">
                <X size={16} />
              </button>
            </div>
          )}

          {/* Total + cuánto va pagado y cuánto falta */}
          <div className="px-5 py-4 bg-gray-50 space-y-1.5">
            <div className="flex items-center">
              <span className="flex-1 text-sm font-bold text-gray-900">TOTAL FIJO MENSUAL</span>
              <span className="text-lg font-bold text-gray-900 tabular-nums">{formatCOP(totalFijos)}</span>
              <span className="w-[76px]" />
            </div>
            {(() => {
              const totalPagado = gastos.filter(g => g.activo && pagados.has(g.id)).reduce((s, g) => s + g.monto, 0)
              const totalPendiente = totalFijos - totalPagado
              return (
                <div className="flex items-center text-xs">
                  <span className="flex-1 text-green-700 font-semibold">Ya pagados: {formatCOP(totalPagado)}</span>
                  <span className={`font-semibold tabular-nums ${totalPendiente > 0 ? 'text-red-600' : 'text-green-700'}`}>
                    {totalPendiente > 0 ? `Faltan por pagar: ${formatCOP(totalPendiente)}` : '✓ Todo pagado'}
                  </span>
                  <span className="w-[76px]" />
                </div>
              )
            })()}
          </div>
        </div>
      </SectionCard>
    </div>
  )
}
