'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatCOP } from '@/lib/utils/format'
import { guardarGastoFijoAction, eliminarGastoFijoAction } from '@/app/actions/gastos-fijos'
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

export function GastosFijosPanel({ gastos, totalFijos, puntoEquilibrio, ventasMes, gastosVariablesMes, diasMes, margenBruto, diaDelMes, diasCalendario }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Edición inline: id del gasto en edición (o 'nuevo' para el formulario de agregar)
  const [editando, setEditando] = useState<string | null>(null)
  const [concepto, setConcepto] = useState('')
  const [monto, setMonto] = useState('')

  const pctCubierto = puntoEquilibrio > 0 ? Math.min(100, (ventasMes / puntoEquilibrio) * 100) : 0
  const faltante = Math.max(0, puntoEquilibrio - ventasMes)
  const cubierto = ventasMes >= puntoEquilibrio

  // ── Simulador interactivo ──────────────────────────────────────────────────
  const [simVentas, setSimVentas] = useState(400_000_000)
  const [simMargen, setSimMargen] = useState(Math.round(margenBruto * 1000) / 10) // en %
  const [simBonos, setSimBonos] = useState(3_000_000)
  const simBruta = Math.round(simVentas * (simMargen / 100))
  const simNeta = simBruta - totalFijos - simBonos
  const simEquilibrio = simMargen > 0 ? Math.ceil((totalFijos + simBonos) / (simMargen / 100)) : 0

  // Proyección de cierre según el ritmo real del mes
  const proyeccion = diaDelMes >= 1 ? Math.round((ventasMes / diaDelMes) * diasCalendario) : 0

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

      {/* Avance del mes contra el punto de equilibrio */}
      <SectionCard title="Avance del mes" icon={TrendingUp} headerRight={
        <span className={`text-sm font-bold ${cubierto ? 'text-green-600' : 'text-gray-500'}`}>
          {pctCubierto.toFixed(0)}% del punto de equilibrio
        </span>
      }>
        <div className="p-5 space-y-3">
          <div className="flex items-baseline justify-between">
            <p className="text-2xl font-bold tracking-tight text-gray-900">{formatCOP(ventasMes)}</p>
            <p className="text-xs text-gray-400">ventas del mes en curso</p>
          </div>
          <div className="h-3.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${cubierto ? 'bg-gradient-to-r from-green-500 to-emerald-400' : 'bg-gradient-to-r from-blue-600 to-blue-400'}`}
              style={{ width: `${pctCubierto}%` }}
            />
          </div>
          <p className="text-xs text-gray-500">
            {cubierto
              ? '✅ Los gastos fijos del mes ya están cubiertos — lo que se venda de aquí en adelante es ganancia.'
              : `Faltan ${formatCOP(faltante)} en ventas para cubrir los gastos fijos del mes.`}
          </p>
          {proyeccion > 0 && diaDelMes >= 2 && (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3">
              <div className="w-9 h-9 rounded-2xl bg-blue-100 flex items-center justify-center shrink-0">
                <TrendingUp size={16} className="text-blue-600" />
              </div>
              <p className="text-xs text-gray-600">
                Al ritmo actual (día {diaDelMes} de {diasCalendario}), el mes cerraría en{' '}
                <strong className="text-gray-900">{formatCOP(proyeccion)}</strong>
                {proyeccion >= puntoEquilibrio
                  ? ` — ${(proyeccion / puntoEquilibrio).toFixed(1)} veces el punto de equilibrio.`
                  : ' — por debajo del punto de equilibrio, hay que apretar.'}
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

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">{error}</p>
      )}

      {/* Lista de gastos fijos */}
      <SectionCard title="Gastos fijos del mes" icon={Wallet} headerRight={
        editando !== 'nuevo' ? (
          <Button variant="secondary" onClick={() => abrirEdicion(null)} className="text-xs !py-1.5">
            <Plus size={14} className="mr-1" /> Agregar
          </Button>
        ) : undefined
      }>
        <div className="divide-y divide-gray-50">
          {gastos.map(g => (
            <div key={g.id} className="flex items-center gap-2 px-5 py-3">
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
                  <span className="flex-1 text-sm font-medium text-gray-700">{g.concepto}</span>
                  <span className="text-sm font-bold text-gray-900 tabular-nums">{formatCOP(g.monto)}</span>
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

          {/* Total */}
          <div className="flex items-center px-5 py-4 bg-gray-50">
            <span className="flex-1 text-sm font-bold text-gray-900">TOTAL FIJO MENSUAL</span>
            <span className="text-lg font-bold text-gray-900 tabular-nums">{formatCOP(totalFijos)}</span>
            <span className="w-[76px]" />
          </div>
        </div>
      </SectionCard>
    </div>
  )
}
