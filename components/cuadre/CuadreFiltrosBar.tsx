'use client'

import { useRouter } from 'next/navigation'

export function CuadreFiltrosBar({
  desde, hasta, sede, sedes, esAdmin,
}: {
  desde: string
  hasta: string
  sede: string
  sedes: { codigo: string; nombre: string }[]
  esAdmin: boolean
}) {
  const router = useRouter()

  function aplicar(patch: Partial<{ desde: string; hasta: string; sede: string }>) {
    const next = { desde, hasta, sede, ...patch }
    const params = new URLSearchParams({ desde: next.desde, hasta: next.hasta })
    if (next.sede) params.set('sede', next.sede)
    router.push(`/cuadre?${params.toString()}`)
  }

  function hoy() {
    const d = new Date().toISOString().slice(0, 10)
    aplicar({ desde: d, hasta: d })
  }

  const cls = 'rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

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
      {esAdmin && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Sede</label>
          <select value={sede} onChange={e => aplicar({ sede: e.target.value })} className={cls}>
            <option value="">Todas (consolidado)</option>
            {sedes.map(s => <option key={s.codigo} value={s.codigo}>{s.nombre}</option>)}
          </select>
        </div>
      )}
      <button type="button" onClick={hoy} className="rounded-lg bg-gray-100 text-gray-700 px-3 py-2 text-sm font-medium hover:bg-gray-200">
        Hoy
      </button>
    </div>
  )
}
