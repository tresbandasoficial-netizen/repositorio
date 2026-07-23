import { EstadisticaDia } from '@/lib/queries/estadisticas'
import { formatCOP } from '@/lib/utils/format'

// Sedes en orden fijo (el negocio tiene exactamente estas tres).
const SEDES = [
  { codigo: 'TR', nombre: 'Bucaramanga' },
  { codigo: 'CR', nombre: 'Cúcuta' },
  { codigo: 'SR', nombre: 'Santa Rosa' },
]

// Celda de dinero: monto o guion si es cero.
function Monto({ valor, className = 'text-gray-800' }: { valor: number; className?: string }) {
  return valor > 0
    ? <span className={`font-medium ${className}`}>{formatCOP(valor)}</span>
    : <span className="text-gray-300">—</span>
}

// 'YYYY-MM-DD' → Date al mediodía local (evita corrimientos de zona horaria).
function parseFecha(f: string): Date {
  return new Date(f + 'T12:00:00')
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// Lunes de la semana a la que pertenece la fecha.
function lunesDe(f: string): Date {
  const d = parseFecha(f)
  const dow = (d.getDay() + 6) % 7 // 0 = lunes
  d.setDate(d.getDate() - dow)
  return d
}
function fmtDiaMes(d: Date): string {
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}
// "5–11 jul" o "28 jun–4 jul"
function labelSemana(lunes: Date): string {
  const dom = new Date(lunes)
  dom.setDate(dom.getDate() + 6)
  const ini = lunes.getMonth() === dom.getMonth() ? String(lunes.getDate()) : fmtDiaMes(lunes)
  return `${ini}–${fmtDiaMes(dom)}`
}

type Semana = {
  key: string
  label: string
  pedidosCount: number
  ventasTotal: number
  porSede: Record<string, { pedido: number; tienda: number }>
}

// Agrupa por semana (lunes a domingo) lo vendido en cada sede, separando
// Pedidos (encargos) de Tienda (venta inmediata).
export function VentasPorSemanaSede({ dias }: { dias: EstadisticaDia[] }) {
  const mapa = new Map<string, Semana>()
  for (const d of dias) {
    const lunes = lunesDe(d.fecha)
    const key = ymd(lunes)
    const sem = mapa.get(key) ?? {
      key,
      label: labelSemana(lunes),
      pedidosCount: 0,
      ventasTotal: 0,
      porSede: {},
    }
    sem.pedidosCount += d.pedidos
    sem.ventasTotal += d.ventas
    for (const s of SEDES) {
      const v = d.ventas_por_sede_tipo[s.codigo] ?? { pedido: 0, tienda: 0 }
      const t = sem.porSede[s.codigo] ?? { pedido: 0, tienda: 0 }
      t.pedido += v.pedido
      t.tienda += v.tienda
      sem.porSede[s.codigo] = t
    }
    mapa.set(key, sem)
  }

  const semanas = Array.from(mapa.values()).sort((a, b) => b.key.localeCompare(a.key)) // más reciente primero

  // Totales del período por sede.
  const tot: Record<string, { pedido: number; tienda: number }> = {}
  let granTotal = 0
  for (const sem of semanas) {
    for (const s of SEDES) {
      const v = sem.porSede[s.codigo] ?? { pedido: 0, tienda: 0 }
      const t = tot[s.codigo] ?? { pedido: 0, tienda: 0 }
      t.pedido += v.pedido
      t.tienda += v.tienda
      tot[s.codigo] = t
    }
    granTotal += sem.ventasTotal
  }

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-bold text-gray-900">Ventas por semana y sede</h2>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Pedidos</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Tienda</span>
          <span className="text-gray-300">·</span>
          <span>últimos 30 días</span>
        </div>
      </div>

      {semanas.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-gray-400">Sin ventas en el período</p>
      ) : (
        <div className="p-3 space-y-2.5">
          {semanas.map((sem, idx) => (
            <div key={sem.key} className="border border-gray-200 rounded-xl p-3">
              {/* Encabezado de la semana */}
              <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                <span className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-gray-700 text-white text-[11px] font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                  <span className="text-sm font-bold text-gray-900">{sem.label}</span>
                  <span className="text-xs text-gray-400">{sem.pedidosCount} pedidos</span>
                </span>
                <span className="text-sm font-bold text-gray-900">{formatCOP(sem.ventasTotal)}</span>
              </div>
              {/* Una celda por sede */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {SEDES.map(s => {
                  const v = sem.porSede[s.codigo] ?? { pedido: 0, tienda: 0 }
                  const sinVentas = v.pedido === 0 && v.tienda === 0
                  return (
                    <div key={s.codigo} className={`rounded-lg border px-3 py-2 ${sinVentas ? 'border-gray-100 bg-gray-50/60' : 'border-gray-200 bg-white'}`}>
                      <p className={`text-[11px] uppercase font-semibold ${sinVentas ? 'text-gray-300' : 'text-gray-500'}`}>
                        {s.nombre} <span className="font-normal opacity-60">({s.codigo})</span>
                      </p>
                      <div className="flex items-center justify-between mt-1 text-xs">
                        <span className="text-blue-600">Pedidos <Monto valor={v.pedido} className="text-blue-700" /></span>
                        <span className="text-emerald-600">Tienda <Monto valor={v.tienda} className="text-emerald-700" /></span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Total del período */}
          <div className="border-2 border-blue-200 bg-blue-50 rounded-xl p-3">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
              <span className="text-xs font-bold text-blue-800 uppercase tracking-wide">Total período</span>
              <span className="text-base font-bold text-blue-700">{formatCOP(granTotal)}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {SEDES.map(s => {
                const t = tot[s.codigo] ?? { pedido: 0, tienda: 0 }
                return (
                  <div key={s.codigo} className="rounded-lg bg-white border border-blue-100 px-3 py-2">
                    <p className="text-[11px] uppercase font-semibold text-gray-500">{s.nombre}</p>
                    <div className="flex items-center justify-between mt-1 text-xs">
                      <span className="text-blue-600">Pedidos <span className="font-bold text-blue-700">{formatCOP(t.pedido)}</span></span>
                      <span className="text-emerald-600">Tienda <span className="font-bold text-emerald-700">{formatCOP(t.tienda)}</span></span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
