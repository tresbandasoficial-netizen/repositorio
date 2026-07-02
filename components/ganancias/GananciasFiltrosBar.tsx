'use client'

import { useRouter } from 'next/navigation'

const cls = 'rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

// Filtros del reporte de ganancias: rango de fechas + sede (solo admin).
// La sede se pasa por sede_id (igual que /gastos).
export function GananciasFiltrosBar({
  desde, hasta, sede, sedes,
}: {
  desde: string
  hasta: string
  sede: string
  sedes: { id: string; nombre: string; codigo: string }[]
}) {
  const router = useRouter()

  function aplicar(patch: Partial<{ desde: string; hasta: string; sede: string }>) {
    const next = { desde, hasta, sede, ...patch }
    const params = new URLSearchParams({ desde: next.desde, hasta: next.hasta })
    if (next.sede) params.set('sede', next.sede)
    router.push(`/ganancias?${params.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-end gap-3 bg-white rounded-xl border border-gray-100 p-4">
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Desde</label>
        <input type="date" value={desde} onChange={e => aplicar({ desde: e.target.value })} className={cls} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Hasta</label>
        <input type="date" value={hasta} onChange={e => aplicar({ hasta: e.target.value })} className={cls} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Sede</label>
        <select value={sede} onChange={e => aplicar({ sede: e.target.value })} className={cls}>
          <option value="">Todas (consolidado)</option>
          {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre} ({s.codigo})</option>)}
        </select>
      </div>
    </div>
  )
}
