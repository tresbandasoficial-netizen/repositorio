'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatCOP, formatMiles } from '@/lib/utils/format'
import { guardarGastoFijoAction, eliminarGastoFijoAction } from '@/app/actions/gastos-fijos'
import { Button } from '@/components/ui/Button'
import { Pencil, Trash2, Plus, X, Check } from 'lucide-react'

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
      {/* Tarjetas resumen */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Gastos fijos / mes" value={formatCOP(totalFijos)} />
        <Card label="Hay que vender (mes)" value={formatCOP(puntoEquilibrio)} acento />
        <Card label={`Por día (${diasMes} días)`} value={formatCOP(Math.ceil(puntoEquilibrio / diasMes))} />
        <Card label="Gastos variables del mes" value={formatCOP(gastosVariablesMes)} />
      </div>

      {/* Avance del mes contra el punto de equilibrio */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4 space-y-2">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold text-gray-900">Ventas del mes: {formatCOP(ventasMes)}</p>
          <p className={`text-sm font-bold ${cubierto ? 'text-green-600' : 'text-gray-500'}`}>
            {pctCubierto.toFixed(0)}% del punto de equilibrio
          </p>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${cubierto ? 'bg-green-500' : 'bg-blue-500'}`}
            style={{ width: `${pctCubierto}%` }}
          />
        </div>
        <p className="text-xs text-gray-500">
          {cubierto
            ? '✅ Los gastos fijos del mes ya están cubiertos — lo que se venda de aquí en adelante es ganancia.'
            : `Faltan ${formatCOP(faltante)} en ventas para cubrir los gastos fijos del mes.`}
        </p>
        {proyeccion > 0 && diaDelMes >= 2 && (
          <p className="text-xs text-gray-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
            📈 Al ritmo actual (día {diaDelMes} de {diasCalendario}), el mes cerraría en{' '}
            <strong>{formatCOP(proyeccion)}</strong>
            {proyeccion >= puntoEquilibrio
              ? ` — ${(proyeccion / puntoEquilibrio).toFixed(1)} veces el punto de equilibrio.`
              : ' — por debajo del punto de equilibrio, hay que apretar.'}
          </p>
        )}
      </div>

      {/* ── Simulador: ¿y si vendemos…? ── */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-900">🎛️ Simulador — ¿y si este mes vendemos…?</p>

        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-bold text-blue-700 tabular-nums w-40">{formatCOP(simVentas)}</span>
          <input
            type="range" min={0} max={800_000_000} step={10_000_000}
            value={simVentas} onChange={e => setSimVentas(Number(e.target.value))}
            className="flex-1 accent-blue-600"
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-gray-500">Utilidad bruta ({simMargen}%)</p>
            <p className="font-bold text-gray-900 tabular-nums">{formatCOP(simBruta)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-gray-500">Gastos fijos</p>
            <p className="font-bold text-gray-900 tabular-nums">−{formatCOP(totalFijos)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-gray-500">Bonos</p>
            <p className="font-bold text-gray-900 tabular-nums">−{formatCOP(simBonos)}</p>
          </div>
          <div className={`rounded-lg px-3 py-2 ${simNeta >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
            <p className="text-[11px] uppercase tracking-wide text-gray-500">Nos queda</p>
            <p className={`font-bold tabular-nums text-base ${simNeta >= 0 ? 'text-green-700' : 'text-red-700'}`}>
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

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      {/* Lista de gastos fijos */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm divide-y divide-gray-50">
        {gastos.map(g => (
          <div key={g.id} className="flex items-center gap-2 px-4 py-2.5">
            {editando === g.id ? (
              <>
                <input
                  value={concepto}
                  onChange={e => setConcepto(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-sm"
                />
                <input
                  value={monto}
                  onChange={e => setMonto(e.target.value)}
                  inputMode="numeric"
                  className="w-32 border border-gray-300 rounded-lg px-2 py-1 text-sm text-right"
                />
                <button onClick={guardar} disabled={pending} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg">
                  <Check size={16} />
                </button>
                <button onClick={() => setEditando(null)} className="p-1.5 text-gray-400 hover:bg-gray-50 rounded-lg">
                  <X size={16} />
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm text-gray-800">{g.concepto}</span>
                <span className="text-sm font-semibold text-gray-900 tabular-nums">{formatCOP(g.monto)}</span>
                <button onClick={() => abrirEdicion(g)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                  <Pencil size={15} />
                </button>
                <button onClick={() => eliminar(g.id, g.concepto)} disabled={pending} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                  <Trash2 size={15} />
                </button>
              </>
            )}
          </div>
        ))}

        {/* Agregar nuevo */}
        <div className="px-4 py-2.5">
          {editando === 'nuevo' ? (
            <div className="flex items-center gap-2">
              <input
                value={concepto}
                onChange={e => setConcepto(e.target.value)}
                placeholder="Concepto (ej. Seguro moto)"
                className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-sm"
                autoFocus
              />
              <input
                value={monto}
                onChange={e => setMonto(e.target.value)}
                inputMode="numeric"
                placeholder="Monto"
                className="w-32 border border-gray-300 rounded-lg px-2 py-1 text-sm text-right"
              />
              <button onClick={guardar} disabled={pending} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg">
                <Check size={16} />
              </button>
              <button onClick={() => setEditando(null)} className="p-1.5 text-gray-400 hover:bg-gray-50 rounded-lg">
                <X size={16} />
              </button>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => abrirEdicion(null)} className="text-sm">
              <Plus size={15} className="mr-1" /> Agregar gasto fijo
            </Button>
          )}
        </div>

        {/* Total */}
        <div className="flex items-center px-4 py-3 bg-gray-50 rounded-b-xl">
          <span className="flex-1 text-sm font-bold text-gray-900">TOTAL FIJO MENSUAL</span>
          <span className="text-base font-bold text-gray-900 tabular-nums">{formatCOP(totalFijos)}</span>
          <span className="w-[76px]" />
        </div>
      </div>
    </div>
  )
}

function Card({ label, value, acento }: { label: string; value: string; acento?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 shadow-sm ${acento ? 'bg-blue-50 border-blue-100' : 'bg-white border-gray-100'}`}>
      <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${acento ? 'text-blue-700' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}
