'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { registrarCambioTallaAction } from '@/app/actions/devoluciones'
import { TallaSelect } from '@/components/ui/TallaSelect'
import type { CategoriaArticulo, SexoArticulo } from '@/types'
import { Repeat, X } from 'lucide-react'

type ItemCambio = {
  id: string
  label: string       // "ADIDAS Falda · ×1"
  talla: string | null
  categoria: CategoriaArticulo | null
  sexo: SexoArticulo | null
  tieneFicha: boolean // enlazado al catálogo (necesario para entrar a stock)
}

// Botón "Cambio de talla" del detalle del pedido (solo entregados): se elige la
// prenda y la talla nueva → la talla vieja entra al inventario, el artículo
// queda pedido en la talla nueva y el pedido vuelve a PENDIENTE para pedirlo
// otra vez. Sin bonos: la plata pagada se queda en el mismo pedido.
export function CambioTallaButton({ pedidoId, items }: { pedidoId: string; items: ItemCambio[] }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [itemSel, setItemSel] = useState<string | null>(items.length === 1 ? items[0].id : null)
  const [tallaNueva, setTallaNueva] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState<{ numeroOrden: string; tallaVieja: string; tallaNueva: string } | null>(null)

  const item = items.find(i => i.id === itemSel)

  async function registrar() {
    if (!itemSel || !tallaNueva.trim()) return
    if (!confirm(
      `¿Registrar el cambio de talla?\n\n` +
      `• ${item?.label} pasa de T${item?.talla || '—'} a T${tallaNueva.trim()}\n` +
      `• La prenda devuelta ENTRA al inventario\n` +
      `• El pedido vuelve a PENDIENTE para pedirlo de nuevo\n` +
      `• Los pagos quedan igual (sin bonos)`
    )) return
    setCargando(true)
    setError(null)
    const r = await registrarCambioTallaAction(pedidoId, itemSel, tallaNueva)
    setCargando(false)
    if (!r.ok) { setError(r.error); return }
    setListo(r)
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => { setAbierto(true); setError(null); setListo(null); setTallaNueva('') }}
        className="text-sm bg-white border border-sky-300 hover:bg-sky-50 px-3.5 py-2 rounded-xl font-medium text-sky-700 transition-colors inline-flex items-center gap-1.5"
      >
        <Repeat size={15} /> Cambio de talla
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !cargando && setAbierto(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4 relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setAbierto(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>

            {listo ? (
              <>
                <h3 className="text-base font-bold text-gray-900">✅ Cambio registrado</h3>
                <div className="text-sm text-gray-700 space-y-1.5">
                  <p>Talla <strong>{listo.tallaVieja}</strong> → <strong>{listo.tallaNueva}</strong>.</p>
                  <p>• La prenda devuelta entró al inventario.</p>
                  <p>• El pedido <span className="font-mono font-semibold">{listo.numeroOrden}</span> volvió a <strong>Pendiente</strong>: ya aparece en la lista para pedirlo de nuevo.</p>
                  <p>• Los pagos del cliente siguen en el pedido, sin bonos.</p>
                </div>
                <button
                  onClick={() => setAbierto(false)}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl py-2.5"
                >
                  Listo
                </button>
              </>
            ) : (
              <>
                <h3 className="text-base font-bold text-gray-900">Cambio de talla</h3>
                <p className="text-xs text-gray-500">
                  La prenda devuelta entra al inventario y el pedido vuelve a pendiente con la talla
                  nueva, para pedirla otra vez. Los pagos quedan igual.
                </p>

                {items.length > 1 && (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {items.map(it => (
                      <label
                        key={it.id}
                        className={`flex items-center gap-3 border rounded-xl px-3 py-2.5 cursor-pointer transition-colors ${
                          itemSel === it.id ? 'border-sky-400 bg-sky-50' : 'border-gray-200 hover:border-gray-300'
                        } ${!it.tieneFicha ? 'opacity-60' : ''}`}
                      >
                        <input
                          type="radio"
                          name="item-cambio"
                          checked={itemSel === it.id}
                          disabled={!it.tieneFicha}
                          onChange={() => setItemSel(it.id)}
                          className="accent-sky-500 w-4 h-4"
                        />
                        <span className="flex-1 text-sm text-gray-800">{it.label}</span>
                        <span className="text-sm font-semibold text-gray-500">T {it.talla || '—'}</span>
                      </label>
                    ))}
                  </div>
                )}

                {items.length === 1 && (
                  <p className="text-sm text-gray-800 border border-gray-200 rounded-xl px-3 py-2.5">
                    {items[0].label} · <span className="font-semibold">T {items[0].talla || '—'}</span>
                  </p>
                )}

                {item && (
                  <div>
                    <label className="text-xs font-semibold text-gray-600 uppercase">¿Por cuál talla la cambia?</label>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="shrink-0 rounded-xl bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-500">
                        T {item.talla || '—'} →
                      </span>
                      {/* Mismo selector de tallas del resto del sistema: ropa,
                          niño o tenis según la categoría del artículo. */}
                      <TallaSelect
                        categoria={item.categoria}
                        sexo={item.sexo}
                        value={tallaNueva}
                        onChange={setTallaNueva}
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                  </div>
                )}

                {items.some(i => !i.tieneFicha) && (
                  <p className="text-[11px] text-amber-700">
                    Las prendas opacas no están enlazadas al catálogo — enlázalas primero (Editar pedido).
                  </p>
                )}

                {error && (
                  <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
                )}

                <button
                  onClick={registrar}
                  disabled={!itemSel || !tallaNueva.trim() || cargando}
                  className="w-full bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold rounded-xl py-2.5 disabled:opacity-50"
                >
                  {cargando ? 'Registrando…' : 'Hacer el cambio'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
