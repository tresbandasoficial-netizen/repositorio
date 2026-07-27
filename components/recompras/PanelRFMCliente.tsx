import { formatCOP } from '@/lib/utils/format'

// R, F y M de un cliente. Los tres valores salen de vista_rfm_clientes y son de
// los últimos 365 días. null = sin compras en ese periodo.
export function PanelRFMCliente({
  r, f, m,
}: {
  r?: number | null
  f?: number | null
  m?: number | null
}) {
  return (
    <div className="grid grid-cols-3 gap-4 rounded-lg border border-gray-200 bg-gray-50/60 px-4 py-2 text-center">
      <Dato
        titulo="Última"
        valor={r == null ? '—' : String(r)}
        unidad={r == null ? 'sin compras' : r === 1 ? 'día' : 'días'}
      />
      <Dato
        titulo="Compras"
        valor={f == null ? '—' : String(f)}
        unidad={f === 1 ? 'vez' : 'veces'}
      />
      <Dato
        titulo="Gastado"
        valor={m ? formatCOP(m) : '—'}
        unidad="en el año"
      />
    </div>
  )
}

function Dato({ titulo, valor, unidad }: { titulo: string; valor: string; unidad: string }) {
  return (
    <div className="min-w-[4.5rem]">
      <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{titulo}</div>
      <div className="text-sm font-bold text-gray-900 tabular-nums">{valor}</div>
      <div className="text-[10px] text-gray-400">{unidad}</div>
    </div>
  )
}
