'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { registrarCambioAction, stockParaCambioAction, type NuevoArticuloCambio } from '@/app/actions/devoluciones'
import { TallaSelect } from '@/components/ui/TallaSelect'
import { BuscadorArticulo, type ArticuloElegido } from '@/components/ui/BuscadorArticulo'
import type { CategoriaArticulo, SexoArticulo } from '@/types'
import { formatMiles } from '@/lib/utils/format'
import { Repeat, X } from 'lucide-react'

export type ItemCambio = {
  id: string
  pedidoId: string
  numeroOrden?: string // se muestra cuando las prendas vienen de varios pedidos (factura)
  label: string       // "ADIDAS Falda · ×1"
  talla: string | null
  categoria: CategoriaArticulo | null
  sexo: SexoArticulo | null
  tieneFicha: boolean // enlazado al catálogo (necesario para entrar a stock)
  cantidad?: number   // unidades de la prenda (para comprobar que alcanza el stock)
}

// Botón "Hacer cambio" (pedidos entregados), en el detalle del pedido y de la
// factura. La prenda devuelta entra al inventario y el valor pagado se traslada
// como abono. Si lo que se lleva el cliente HAY en la tienda (stock de la sede),
// se ofrece entregarlo ya (venta inmediata, descuenta stock); si no hay, el
// cambio queda como PEDIDO NUEVO en la cola del sistema.
// sedeId/sedeCodigo: sede del pedido. El stock que se muestra al buscar el
// artículo nuevo es SOLO el de esa sede (sin esto sumaba el de todas las sedes y
// aparecían tallas que en la tienda no hay).
export function CambioTallaButton({ items, sedeId = null, sedeCodigo }: { items: ItemCambio[]; sedeId?: string | null; sedeCodigo?: string }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [itemSel, setItemSel] = useState<string | null>(items.length === 1 ? items[0].id : null)
  const [modo, setModo] = useState<'talla' | 'otro'>('talla')
  const [tallaNueva, setTallaNueva] = useState('')
  // Producto nuevo del catálogo (cambio por otro artículo): se llena aquí
  // mismo y el pedido nuevo nace ya con él.
  const [busqueda, setBusqueda] = useState('')
  const [nuevoArt, setNuevoArt] = useState<ArticuloElegido | null>(null)
  const [nuevaTallaOtro, setNuevaTallaOtro] = useState('')
  const [nuevoPrecio, setNuevoPrecio] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState<{ nuevoPedidoId: string; nuevoNumero: string; abonoTrasladado: number; saldoAFavor: number; entregado: boolean; diferencia: number } | null>(null)
  // Stock por talla de la prenda a cambiar, en la sede (modo "otra talla").
  const [stockTallas, setStockTallas] = useState<Array<{ talla: string | null; stock: number }>>([])
  // Entregar ya lo que hay en la tienda (marcado por defecto cuando hay).
  const [entregarYa, setEntregarYa] = useState(true)

  const item = items.find(i => i.id === itemSel)

  useEffect(() => {
    if (!abierto || !item || modo !== 'talla') return
    let cancelado = false
    setStockTallas([])
    stockParaCambioAction(item.pedidoId, item.id).then(r => {
      if (!cancelado && r.ok) setStockTallas(r.tallas)
    })
    return () => { cancelado = true }
  }, [abierto, item, modo])

  const cantidadItem = item?.cantidad ?? 1
  const claveTalla = (t: string | null | undefined) => (t ?? '').trim().toUpperCase()
  // Unidades que HAY en la tienda de lo que se va a llevar el cliente.
  const stockDestino = modo === 'talla'
    ? (tallaNueva.trim() ? (stockTallas.find(t => claveTalla(t.talla) === claveTalla(tallaNueva))?.stock ?? 0) : null)
    : (nuevoArt && (nuevaTallaOtro.trim() || nuevoArt.categoria === 'accesorios')
        ? (nuevoArt.tallas.find(t => claveTalla(t.talla) === claveTalla(nuevaTallaOtro))?.stock ?? 0)
        : null)
  const hayEnTienda = stockDestino != null && stockDestino >= cantidadItem
  const entregar = hayEnTienda && entregarYa
  const precioNum = parseInt(nuevoPrecio.replace(/\D/g, ''), 10) || 0
  const puedeRegistrar = !!itemSel && (
    modo === 'talla' ? !!tallaNueva.trim() : (!nuevoArt || precioNum > 0)
  )

  function elegirNuevo(a: ArticuloElegido) {
    setNuevoArt(a)
    setBusqueda(a.codigo ? `${a.codigo} — ${a.nombre}` : a.nombre)
    setNuevaTallaOtro('')
    setNuevoPrecio(a.precio_venta ? String(a.precio_venta) : '')
  }

  async function registrar() {
    if (!puedeRegistrar || !itemSel) return
    const conProducto = modo === 'otro' && nuevoArt
    if (!confirm(
      `¿Registrar el cambio?\n\n` +
      `• ${item?.label} (T${item?.talla || '—'}) se devuelve y ENTRA al inventario\n` +
      `• ${entregar ? 'Se ENTREGA YA (sale de la tienda)' : 'Se crea un PEDIDO NUEVO'} ${
        modo === 'talla' ? `con la talla ${tallaNueva.trim()}`
        : conProducto ? `con ${nuevoArt!.marca} ${nuevoArt!.nombre}${nuevaTallaOtro ? ` T${nuevaTallaOtro}` : ''} ($${precioNum.toLocaleString('es-CO')})`
        : 'con el mismo artículo (edítalo para poner el nuevo)'
      }\n` +
      `• El valor pagado pasa como abono (sin bonos, sin plata doble)`
    )) return
    setCargando(true)
    setError(null)
    const payload: NuevoArticuloCambio | null = conProducto ? {
      articulo_id:  nuevoArt!.articulo_id,
      codigo:       nuevoArt!.codigo,
      marca:        nuevoArt!.marca,
      descripcion:  nuevoArt!.nombre,
      talla:        nuevaTallaOtro.trim() || null,
      precio_venta: precioNum,
      imagen_url:   nuevoArt!.foto,
      color:        nuevoArt!.color,
      sexo:         nuevoArt!.sexo,
      categoria:    nuevoArt!.categoria,
    } : null
    const r = await registrarCambioAction(item!.pedidoId, itemSel, modo === 'talla' ? tallaNueva : null, payload, entregar)
    setCargando(false)
    if (!r.ok) { setError(r.error); return }
    setListo(r)
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => { setAbierto(true); setError(null); setListo(null); setEntregarYa(true); setTallaNueva(''); setModo('talla'); setBusqueda(''); setNuevoArt(null); setNuevaTallaOtro(''); setNuevoPrecio('') }}
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
                  {listo.entregado ? (
                    <p>
                      • <strong>Se entregó ya</strong> lo que hay en la tienda (venta{' '}
                      <Link href={`/pedidos/${listo.nuevoPedidoId}`} className="font-mono font-bold text-blue-600 hover:underline">
                        {listo.nuevoNumero}
                      </Link>
                      ) y salió del stock de la sede.
                    </p>
                  ) : (
                    <p>
                      • Se creó el pedido nuevo{' '}
                      <Link href={`/pedidos/${listo.nuevoPedidoId}`} className="font-mono font-bold text-blue-600 hover:underline">
                        {listo.nuevoNumero}
                      </Link>{' '}
                      en estado <strong>Pendiente</strong> — ya aparece en el sistema para pedirlo.
                    </p>
                  )}
                  {listo.entregado && listo.diferencia > 0 && (
                    <p className="text-amber-700">
                      ⚠ Lo que se lleva vale <strong>${listo.diferencia.toLocaleString('es-CO')} más</strong>: cóbrale esa diferencia
                      y regístrala como pago en la venta {listo.nuevoNumero}.
                    </p>
                  )}
                  <p>• Abono trasladado al pedido nuevo: <strong>{listo.abonoTrasladado.toLocaleString('es-CO')}</strong> (sin bonos, la plata no se cuenta dos veces).</p>
                  {listo.saldoAFavor > 0 && (
                    <p className="text-amber-700">
                      ⚠ El artículo nuevo vale <strong>${listo.saldoAFavor.toLocaleString('es-CO')} menos</strong> que el
                      devuelto — esa diferencia queda a favor del cliente (entrégala en bono o efectivo).
                    </p>
                  )}
                  {modo === 'otro' && !nuevoArt && (
                    <p className="text-amber-700">✏️ Es cambio por otro artículo: entra al pedido nuevo y edítalo para poner el artículo correcto.</p>
                  )}
                </div>
                <Link
                  href={`/pedidos/${listo.nuevoPedidoId}`}
                  className="block w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl py-2.5 text-center"
                >
                  {listo.entregado ? 'Abrir la venta' : 'Abrir el pedido nuevo'}
                </Link>
              </>
            ) : (
              <>
                <h3 className="text-base font-bold text-gray-900">Hacer cambio</h3>
                <p className="text-xs text-gray-500">
                  La prenda devuelta entra al inventario. Si lo que se lleva el cliente <strong>hay en la tienda</strong>,
                  se entrega ya; si no, queda como un <strong>pedido nuevo</strong> en la cola del sistema. El valor pagado
                  pasa como abono. El pedido original no se toca.
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
                        <span className="flex-1 text-sm text-gray-800">
                          {it.numeroOrden && <span className="font-mono text-xs text-gray-400">{it.numeroOrden} · </span>}
                          {it.label}
                        </span>
                        <span className="text-sm font-semibold text-gray-500">T {it.talla || '—'}</span>
                      </label>
                    ))}
                  </div>
                )}

                {items.length === 1 && (
                  <p className="text-sm text-gray-800 border border-gray-200 rounded-xl px-3 py-2.5">
                    {items[0].numeroOrden && <span className="font-mono text-xs text-gray-400">{items[0].numeroOrden} · </span>}
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
                        stockPorTalla={Object.fromEntries(
                          stockTallas.filter(t => t.talla).map(t => [claveTalla(t.talla), t.stock])
                        )}
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                  </div>
                )}

                {/* ¿Hay en la tienda lo que se lleva? → entregarlo ya, sin crear pedido */}
                {stockDestino != null && (
                  hayEnTienda ? (
                    <label className="flex items-start gap-2 rounded-xl border border-green-300 bg-green-50 px-3 py-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={entregarYa}
                        onChange={e => setEntregarYa(e.target.checked)}
                        className="mt-0.5 w-4 h-4 accent-green-600"
                      />
                      <span className="text-sm text-green-900">
                        <strong>Hay {stockDestino} en la tienda{sedeCodigo ? ` (${sedeCodigo})` : ''}</strong> — entregarlo ahora.
                        <span className="block text-xs text-green-800/80">
                          {entregarYa ? 'Sale del stock y NO se crea pedido.' : 'Desmarcado: se creará un pedido pendiente.'}
                        </span>
                      </span>
                    </label>
                  ) : (
                    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                      No hay en la tienda{sedeCodigo ? ` (${sedeCodigo})` : ''} esa talla: el cambio quedará como <strong>pedido pendiente</strong>.
                    </p>
                  )
                )}

                {modo === 'otro' && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-600 uppercase">¿Por cuál artículo lo cambia?</label>
                      <BuscadorArticulo
                        valor={busqueda}
                        onCambiarTexto={v => { setBusqueda(v); if (nuevoArt) setNuevoArt(null) }}
                        onElegir={elegirNuevo}
                        estado={nuevoArt ? true : undefined}
                        sedeId={sedeId}
                        sedeCodigo={sedeCodigo}
                        placeholder="Código, nombre o marca del artículo nuevo…"
                        className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                          nuevoArt ? 'border-green-400 focus:ring-green-400' : 'border-gray-200 focus:ring-sky-500'
                        }`}
                      />
                    </div>

                    {nuevoArt ? (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs font-semibold text-gray-600 uppercase">Talla nueva</label>
                          <TallaSelect
                            categoria={nuevoArt.categoria as CategoriaArticulo | null}
                            sexo={nuevoArt.sexo as SexoArticulo | null}
                            value={nuevaTallaOtro}
                            onChange={setNuevaTallaOtro}
                            stockPorTalla={Object.fromEntries(
                              nuevoArt.tallas.filter(t => t.talla).map(t => [t.talla!.trim().toUpperCase(), t.stock])
                            )}
                            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-gray-600 uppercase">Precio venta *</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={formatMiles(nuevoPrecio)}
                            onChange={e => setNuevoPrecio(e.target.value.replace(/\D/g, ''))}
                            placeholder="0"
                            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                          />
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 border border-gray-200 rounded-xl px-3 py-2">
                        Busca el artículo nuevo para que el pedido quede montado de una vez. Si aún no está
                        en el catálogo, registra el cambio sin elegirlo y edita el pedido nuevo después.
                      </p>
                    )}
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
