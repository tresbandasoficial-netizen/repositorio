'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { buscarSobrantesAction, asignarItemAction, SobranteCompra } from '@/app/actions/compras'
import { formatCOP, formatFecha } from '@/lib/utils/format'
import { Search, Loader2 } from 'lucide-react'

// Buscador de SOBRANTES para la galería (solo admin): con una prenda "sin
// comprar" seleccionada, busca si ese artículo ya está en alguna factura de
// compra sin asignar y lo asigna al pedido ahí mismo. La asignación usa
// asignarItemAction: valida el cupo del pedido y, si la fila de la factura
// trae varias unidades, la divide y asigna UNA (RPC atómico, mig. 196).
export function BuscarEnFacturas({ pedidoRef, queryInicial }: {
  pedidoRef: string
  queryInicial: string
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [q, setQ] = useState(queryInicial)
  const [buscando, setBuscando] = useState(false)
  const [resultados, setResultados] = useState<SobranteCompra[] | null>(null)
  const [asignando, setAsignando] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function buscar(termino: string) {
    if (termino.trim().length < 2) { setResultados([]); return }
    setBuscando(true)
    setError(null)
    setMensaje(null)
    const r = await buscarSobrantesAction(termino)
    setResultados(r)
    setBuscando(false)
  }

  function abrir() {
    setAbierto(true)
    if (resultados === null) void buscar(queryInicial)
  }

  async function asignar(s: SobranteCompra) {
    const desc = `${s.marca ?? ''} ${s.descripcion}`.trim() + (s.talla ? ` · T${s.talla.trim().toUpperCase()}` : '')
    if (!confirm(
      `¿Asignar ${s.cantidad > 1 ? '1 unidad (la fila tiene ' + s.cantidad + ' y se divide)' : 'esta unidad'} de:\n\n${desc}\nFactura ${s.numero_factura ?? 's/n'} — ${s.proveedor ?? '¿?'}\n\nal pedido ${pedidoRef}?`
    )) return
    setAsignando(s.id)
    setError(null)
    setMensaje(null)
    const r = await asignarItemAction(s.id, 'pedido', pedidoRef, s.cantidad > 1 ? 1 : undefined)
    setAsignando(null)
    if (!r.ok) { setError(r.error); return }
    setMensaje(r.aviso ? `Asignado a ${pedidoRef} — ojo: ${r.aviso}` : `✅ Asignado al pedido ${pedidoRef}`)
    router.refresh()
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={abrir}
        className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl px-3 py-2 transition-colors"
      >
        <Search size={13} /> ¿Ya está en alguna factura? (buscar sobrantes)
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-3 space-y-2">
      <div className="flex gap-1.5">
        <input
          type="text"
          value={q}
          autoFocus
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void buscar(q) }}
          placeholder="Código, nombre o marca…"
          className="flex-1 min-w-0 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400"
        />
        <button
          type="button"
          onClick={() => void buscar(q)}
          disabled={buscando}
          className="shrink-0 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-3 py-1.5 disabled:opacity-50"
        >
          {buscando ? <Loader2 size={13} className="animate-spin" /> : 'Buscar'}
        </button>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="shrink-0 text-gray-400 hover:text-gray-600 text-sm px-1"
          title="Cerrar"
        >
          ✕
        </button>
      </div>

      {mensaje && <p className="text-xs font-medium text-emerald-700">{mensaje}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}

      {resultados !== null && !buscando && (
        resultados.length === 0 ? (
          <p className="text-xs text-gray-500">
            No hay sobrantes que coincidan — ese artículo no está sin asignar en ninguna factura.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {resultados.map(s => (
              <div key={s.id} className="rounded-lg bg-white border border-gray-200 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 text-xs font-semibold text-gray-900 truncate">
                    {s.codigo && <span className="font-mono text-blue-700">{s.codigo} · </span>}
                    {s.marca} {s.descripcion}
                  </span>
                  {s.talla && (
                    <span className="shrink-0 text-[10px] font-bold bg-amber-50 border border-amber-400 text-amber-800 px-1.5 rounded-md">
                      T: {s.talla.trim().toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="min-w-0 text-[11px] text-gray-500 truncate">
                    Fac {s.numero_factura ?? 's/n'} · {s.proveedor} · {s.fecha ? formatFecha(s.fecha) : '—'}
                    {' · '}{s.cantidad} unid · {formatCOP(s.costo_unitario_cop)}
                    {s.llego ? ' · 📦 llegó' : ' · ✈️ en camino'}
                  </span>
                  <button
                    type="button"
                    onClick={() => void asignar(s)}
                    disabled={asignando !== null}
                    className="shrink-0 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-2.5 py-1 disabled:opacity-50"
                  >
                    {asignando === s.id ? 'Asignando…' : `Asignar a ${pedidoRef}`}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
