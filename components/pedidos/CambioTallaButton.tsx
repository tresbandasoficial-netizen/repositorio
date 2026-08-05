'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { registrarCambioAction } from '@/app/actions/devoluciones'
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

// Botón "Hacer cambio" del detalle del pedido (solo entregados). El cambio se
// registra como un PEDIDO NUEVO (talla nueva u otro artículo) que vuelve a la
// cola del sistema; la prenda devuelta entra al inventario y el valor pagado
// se traslada como abono al pedido nuevo — sin bonos y sin duplicar plata.
export function CambioTallaButton({ pedidoId, items }: { pedidoId: string; items: ItemCambio[] }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [itemSel, setItemSel] = useState<string | null>(items.length === 1 ? items[0].id : null)
  const [modo, setModo] = useState<'talla' | 'otro'>('talla')
  const [tallaNueva, setTallaNueva] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState<{ nuevoPedidoId: string; nuevoNumero: string; abonoTrasladado: number } | null>(null)

  const item = items.find(i => i.id === itemSel)
  const puedeRegistrar = !!itemSel && (modo === 'otro' || !!tallaNueva.trim())

  async function registrar() {
    if (!puedeRegistrar || !itemSel) return
    if (!confirm(
      `¿Registrar el cambio?\n\n` +
      `• ${item?.label} (T${item?.talla || '—'}) se devuelve y ENTRA al inventario\n` +
      `• Se crea un PEDIDO NUEVO ${modo === 'talla' ? `con la talla ${tallaNueva.trim()}` : 'con el mismo artículo (edítalo para poner el nuevo)'}\n` +
      `• El valor pagado pasa como abono al pedido nuevo (sin bonos, sin plata doble)`
    )) return
    setCargando(true)
    setError(null)
    const r = await registrarCambioAction(pedidoId, itemSel, modo === 'talla' ? tallaNueva : null)
    setCargando(false)
    if (!r.ok) { setError(r.error); return }
    setListo(r)
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => { setAbierto(true); setError(null); setListo(null); setTallaNueva(''); setModo('talla') }}
        className="text-sm bg-white border border-sky-300 hover:bg-sky-50 px-3.5 py-2 rounded-xl font-medium text-sky-700 transition-colors inline-flex items-center gap-1.5"
      >
        <Repeat size={15} /> Hacer cambio
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
                  <p>• La prenda devuelta entró al inventario.</p>
                  <p>
                    • Se creó el pedido nuevo{' '}
                    <Link href={`/pedidos/${listo.nuevoPedidoId}`} className="font-mono font-bold text-blue-600 hover:underline">
                      {listo.nuevoNumero}
                    </Link>{' '}
                    en estado <strong>Pendiente</strong> — ya aparece en el sistema para pedirlo.
                  </p>
                  <p>• Abono trasladado al pedido nuevo: <strong>{listo.abonoTrasladado.toLocaleString('es-CO')}</strong> (sin bonos, la plata no se cuenta dos veces).</p>
                  {modo === 'otro' && (
                    <p className="text-amber-700">✏️ Es cambio por otro artículo: entra al pedido nuevo y edítalo para poner el artículo correcto.</p>
                  )}
                </div>
                <Link
                  href={`/pedidos/${listo.nuevoPedidoId}`}
                  className="block w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl py-2.5 text-center"
                >
                  Abrir el pedido nuevo
                </Link>
              </>
            ) : (
              <>
                <h3 className="text-base font-bold text-gray-900">Hacer cambio</h3>
                <p className="text-xs text-gray-500">
                  La prenda devuelta entra al inventario y el cambio queda como un <strong>pedido nuevo</strong> en
                  la cola del sistema, con el valor pagado trasladado como abono. Este pedido no se toca.
                </p>

                {items.length > 1 && (
                  <div className="space-y-2 max-h-44 overflow-y-auto">
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

                {/* ¿Cambio de talla o por otro artículo? */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setModo('talla')}
                    className={`flex-1 text-sm px-3 py-2 rounded-xl border font-medium transition-colors ${
                      modo === 'talla' ? 'bg-sky-600 text-white border-sky-600' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    Otra talla
                  </button>
                  <button
                    type="button"
                    onClick={() => setModo('otro')}
                    className={`flex-1 text-sm px-3 py-2 rounded-xl border font-medium transition-colors ${
                      modo === 'otro' ? 'bg-sky-600 text-white border-sky-600' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    Otro artículo
                  </button>
                </div>

                {modo === 'talla' && item && (
                  <div>
                    <label className="text-xs font-semibold text-gray-600 uppercase">¿Por cuál talla la cambia?</label>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="shrink-0 rounded-xl bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-500">
                        T {item.talla || '—'} →
                      </span>
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

                {modo === 'otro' && (
                  <p className="text-xs text-gray-500 border border-gray-200 rounded-xl px-3 py-2">
                    El pedido nuevo se crea con este mismo artículo y su abono — después lo{' '}
                    <strong>editas</strong> para poner el artículo que el cliente quiere (el precio se ajusta ahí).
                  </p>
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
                  disabled={!puedeRegistrar || cargando}
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
