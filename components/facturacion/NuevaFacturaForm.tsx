'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { buscarClientesAction, ClienteBusqueda } from '@/app/actions/clientes'
import {
  getPedidosFacturablesAction, crearFacturaUnificadaAction, buscarPedidoFacturableAction,
  getItemsPedidosAction, PedidoFacturable, ItemPedido,
} from '@/app/actions/facturacion'
import { getCuentasAction } from '@/app/actions/cuentas'
import { Button } from '@/components/ui/Button'
import { formatCOP, formatFecha } from '@/lib/utils/format'
import { Cuenta } from '@/types'
import { Linea, nuevaLinea, LineaProducto } from '@/components/ventas/LineaProducto'

type SedeOpcion = { id: string; codigo: string; nombre: string }

function venceDefault() {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toISOString().slice(0, 10)
}

const parseCOP = (s: string) => parseInt(s.replace(/\D/g, ''), 10) || 0
const hoy = () => new Date().toISOString().slice(0, 10)

export function NuevaFacturaForm({ sedes, asesorNombre }: { sedes: SedeOpcion[]; asesorNombre: string }) {
  const router = useRouter()

  const [sedeId, setSedeId] = useState(sedes[0]?.id ?? '')
  const sedeCodigo = sedes.find(s => s.id === sedeId)?.codigo ?? ''

  // Cliente
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState<ClienteBusqueda[]>([])
  const [cliente, setCliente] = useState<ClienteBusqueda | null>(null)

  // Pedidos existentes + sus ítems
  const [pedidos, setPedidos] = useState<PedidoFacturable[]>([])
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [itemsPedidos, setItemsPedidos] = useState<ItemPedido[]>([])
  const [cargando, setCargando] = useState(false)
  const [numEncontrado, setNumEncontrado] = useState<string | null>(null)

  // Productos nuevos del inventario
  const [lineas, setLineas] = useState<Linea[]>([])

  // Búsqueda por número de pedido / cliente nuevo
  const [numPedido, setNumPedido] = useState('')
  const [buscandoPedido, setBuscandoPedido] = useState(false)
  const [mostrarNuevo, setMostrarNuevo] = useState(false)
  const [nNombre, setNNombre] = useState('')
  const [nTelefono, setNTelefono] = useState('')
  const [nCedula, setNCedula] = useState('')

  // Config factura
  const [vence, setVence] = useState(venceDefault())
  const [abono, setAbono] = useState('')
  const [cuentaId, setCuentaId] = useState<string | null>(null)
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [credito, setCredito] = useState(false)
  const [envio, setEnvio] = useState('')
  const [descuento, setDescuento] = useState('')
  const [mensajeria, setMensajeria] = useState('')
  const [notas, setNotas] = useState('')

  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  useEffect(() => { getCuentasAction().then(setCuentas).catch(console.error) }, [])

  useEffect(() => {
    if (cliente) return
    const t = setTimeout(async () => {
      if (busqueda.trim().length < 2) { setResultados([]); return }
      setResultados(await buscarClientesAction(busqueda))
    }, 250)
    return () => clearTimeout(t)
  }, [busqueda, cliente])

  async function elegirCliente(c: ClienteBusqueda, preseleccion?: string, numero?: string) {
    setCliente(c)
    setResultados([])
    setBusqueda(c.nombre)
    setCargando(true)
    const ped = await getPedidosFacturablesAction(c.id)
    setPedidos(ped)
    const ids = ped.map(p => p.id)
    setItemsPedidos(ids.length ? await getItemsPedidosAction(ids) : [])
    setSeleccionados(preseleccion ? new Set([preseleccion]) : new Set())
    setNumEncontrado(numero ?? null)
    setCargando(false)
  }

  async function buscarPorPedido() {
    if (!numPedido.trim()) return
    setBuscandoPedido(true); setError('')
    const r = await buscarPedidoFacturableAction(numPedido)
    setBuscandoPedido(false)
    if (!r.ok) { setError(r.error); return }
    await elegirCliente(
      { id: r.data.cliente_id, nombre: r.data.cliente_nombre, telefono_normalizado: r.data.cliente_telefono, cedula: null, ultima_direccion: null },
      r.data.pedido_id, numPedido.trim().toUpperCase(),
    )
  }

  function usarClienteNuevo() {
    if (!nNombre.trim()) { setError('Escribe el nombre del cliente'); return }
    if (!nTelefono.trim()) { setError('Escribe el teléfono del cliente'); return }
    setError('')
    setCliente({ id: '__nuevo__', nombre: nNombre.trim(), telefono_normalizado: nTelefono.trim(), cedula: nCedula.trim() || null, ultima_direccion: null })
    setPedidos([]); setItemsPedidos([]); setSeleccionados(new Set()); setMostrarNuevo(false)
  }

  function reset() {
    setCliente(null); setPedidos([]); setItemsPedidos([]); setSeleccionados(new Set()); setLineas([]); setBusqueda('')
    setMostrarNuevo(false); setNNombre(''); setNTelefono(''); setNCedula(''); setNumEncontrado(null)
    setEnvio(''); setDescuento(''); setAbono(''); setCredito(false); setMensajeria('')
  }

  const pedidosSede = pedidos.filter(p => p.sede_id === sedeId)

  function toggle(id: string) {
    const next = new Set(seleccionados)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSeleccionados(next)
  }

  function setLinea(key: number, patch: Partial<Linea>) {
    setLineas(ls => ls.map(l => l.key === key ? { ...l, ...patch } : l))
  }

  const pedidosElegidos = pedidosSede.filter(p => seleccionados.has(p.id))
  const totalPedidos = pedidosElegidos.reduce((s, p) => s + p.saldo, 0)
  const lineasValidas = lineas.filter(l => l.descripcion.trim() && l.precio_venta > 0)
  const totalProductos = lineasValidas.reduce((s, l) => s + l.precio_venta * l.cantidad, 0)
  const subtotal = totalPedidos + totalProductos
  const envioNum = parseCOP(envio)
  const descuentoNum = parseCOP(descuento)
  const totalNeto = Math.max(0, subtotal + envioNum - descuentoNum)
  const abonoNum = credito ? 0 : parseCOP(abono)
  const saldo = Math.max(0, totalNeto - abonoNum)
  const hayAlgo = pedidosElegidos.length > 0 || lineasValidas.length > 0

  // Ítems de los pedidos seleccionados (para la tabla)
  const itemsElegidos = itemsPedidos.filter(it => seleccionados.has(it.pedido_id))

  function crear() {
    if (!cliente) { setError('Busca y elige un cliente'); return }
    if (!hayAlgo) { setError('Agrega al menos un pedido o un producto'); return }
    if (abonoNum > totalNeto) { setError('El pago no puede superar el total'); return }
    setError('')
    start(async () => {
      const esNuevo = cliente.id === '__nuevo__'
      const r = await crearFacturaUnificadaAction({
        cliente_id: esNuevo ? null : cliente.id,
        cliente_nuevo: esNuevo ? { nombre: cliente.nombre, telefono: cliente.telefono_normalizado, cedula: cliente.cedula ?? '' } : null,
        sede_id: sedeId,
        pedido_ids: pedidosElegidos.map(p => p.id),
        productos_nuevos: lineasValidas.map(({ articulo_id, codigo, marca, descripcion, talla, cantidad, precio_venta, color, sexo, categoria }) => ({
          articulo_id, codigo, marca, descripcion, talla, cantidad, precio_venta, color, sexo, categoria,
        })),
        fecha_vencimiento: vence,
        abono_inicial: abonoNum,
        cuenta_id: credito ? null : cuentaId,
        envio: envioNum,
        descuento: descuentoNum,
        notas,
      })
      if (!r.ok) { setError(r.error); return }
      router.push(`/facturacion/${r.facturaId}`)
    })
  }

  const inputCls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="space-y-5">
      {/* ───────── Encabezado ───────── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Facturar</h1>
          <p className="text-sm text-gray-400 mt-0.5">Crea y emite la factura de venta</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/facturacion"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Ver facturas emitidas
          </Link>
          <Button onClick={crear} disabled={pending || !hayAlgo}>
            {pending ? 'Emitiendo…' : 'Emitir factura'}
          </Button>
        </div>
      </div>

      {/* ───────── Búsqueda ───────── */}
      <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Buscar pedido</label>
          <div className="flex gap-2">
            <input type="text" value={numPedido} onChange={e => setNumPedido(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && buscarPorPedido()} placeholder="N° de pedido (ej: TR1234)"
              className={`${inputCls} font-mono`} />
            <button type="button" onClick={buscarPorPedido} disabled={buscandoPedido || !numPedido.trim()}
              className="px-3 rounded-lg bg-blue-600 text-white disabled:opacity-50">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
            </button>
          </div>
        </div>
        <div className="relative">
          <label className="block text-xs font-medium text-gray-500 mb-1">O buscar cliente</label>
          <input type="text" value={busqueda} onChange={e => { setBusqueda(e.target.value); if (cliente) reset() }}
            placeholder="Nombre o teléfono" className={inputCls} />
          {resultados.length > 0 && !cliente && (
            <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
              {resultados.map(c => (
                <button key={c.id} type="button" onClick={() => elegirCliente(c)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b border-gray-50 last:border-0">
                  <span className="font-medium text-gray-900">{c.nombre}</span>
                  <span className="text-gray-400 ml-2">{c.telefono_normalizado}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" onClick={() => { setMostrarNuevo(v => !v); setError('') }}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-blue-50 text-blue-600 text-sm font-medium hover:bg-blue-100 h-[38px]">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
          Nuevo cliente
        </button>
      </div>

      {/* Cliente nuevo */}
      {mostrarNuevo && !cliente && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input type="text" value={nNombre} onChange={e => setNNombre(e.target.value)} placeholder="Nombre" className={inputCls} />
            <input type="text" value={nTelefono} onChange={e => setNTelefono(e.target.value)} placeholder="Teléfono" className={inputCls} />
            <input type="text" value={nCedula} onChange={e => setNCedula(e.target.value)} placeholder="Cédula (opcional)" className={inputCls} />
          </div>
          <Button onClick={usarClienteNuevo}>Usar este cliente</Button>
        </div>
      )}

      {/* ───────── Cuerpo: dos columnas ───────── */}
      <div className="grid lg:grid-cols-[1fr_340px] gap-5 items-start">
        {/* ============ IZQUIERDA ============ */}
        <div className="space-y-4">
          {!cliente ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 p-10 text-center">
              <p className="text-sm text-gray-400">Busca un pedido por su número o elige un cliente para empezar.</p>
            </div>
          ) : (
            <>
              {/* Cliente + Pedido encontrado */}
              <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-5">
                <div className="flex items-center gap-3 flex-1">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 flex-none">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0112 0v1"/></svg>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Cliente</p>
                    <p className="font-semibold text-gray-900">{cliente.nombre}</p>
                    <p className="text-xs text-gray-400">{cliente.telefono_normalizado}{sedeCodigo ? ` · ${sedeCodigo}` : ''}</p>
                  </div>
                </div>
                {numEncontrado && (
                  <>
                    <div className="w-px h-12 bg-gray-100" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Pedido</p>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Pedido encontrado</span>
                      </div>
                      <p className="font-mono font-semibold text-gray-900">{numEncontrado}</p>
                    </div>
                  </>
                )}
                <button type="button" onClick={reset} className="text-sm text-gray-500 hover:text-gray-700 flex-none">Cambiar</button>
              </div>

              {/* Pedidos del cliente (seleccionables) */}
              {cargando ? (
                <div className="bg-white rounded-xl border border-gray-100 p-4 text-sm text-gray-400">Cargando pedidos…</div>
              ) : pedidosSede.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 p-4">
                  <p className="text-sm font-semibold text-gray-900 mb-3">Pedidos sin facturar</p>
                  <div className="space-y-2">
                    {pedidosSede.map(p => (
                      <label key={p.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          seleccionados.has(p.id) ? 'border-blue-300 bg-blue-50' : 'border-gray-100 hover:bg-gray-50'
                        }`}>
                        <input type="checkbox" checked={seleccionados.has(p.id)} onChange={() => toggle(p.id)} className="w-4 h-4 accent-blue-600" />
                        <div className="flex-1">
                          <p className="font-mono text-sm text-gray-900">{p.numero_orden}</p>
                          <p className="text-xs text-gray-400">{formatFecha(p.fecha_creacion)}</p>
                        </div>
                        <div className="text-right text-xs leading-relaxed">
                          <p className="text-gray-500">Abonado: <span className="font-medium text-green-600">{formatCOP(p.abonado)}</span></p>
                          <p className="text-gray-900 font-bold text-sm">Falta: {formatCOP(p.saldo)}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Tabla de productos */}
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-gray-900">Productos</p>
                  <button type="button" onClick={() => setLineas(ls => [...ls, nuevaLinea()])}
                    className="inline-flex items-center gap-1 text-sm text-blue-600 font-medium hover:underline">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
                    Agregar producto
                  </button>
                </div>

                {/* Productos de pedidos seleccionados (solo lectura) */}
                {itemsElegidos.length > 0 && (
                  <table className="w-full text-sm mb-3">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                        <th className="text-left font-semibold pb-2">Producto</th>
                        <th className="text-left font-semibold pb-2">Talla</th>
                        <th className="text-center font-semibold pb-2">Cant.</th>
                        <th className="text-right font-semibold pb-2">Precio</th>
                        <th className="text-right font-semibold pb-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemsElegidos.map((it, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="py-2.5">
                            <p className="font-medium text-gray-900">{it.marca} {it.descripcion}</p>
                            {it.codigo && <p className="text-xs text-gray-400 font-mono">Código: {it.codigo}</p>}
                          </td>
                          <td>{it.talla ?? '—'}</td>
                          <td className="text-center">{it.cantidad}</td>
                          <td className="text-right">{formatCOP(it.precio_venta)}</td>
                          <td className="text-right font-medium text-gray-900">{formatCOP(it.precio_venta * it.cantidad)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* Productos nuevos del inventario (editables) */}
                {lineas.length > 0 ? (
                  <div className="space-y-3">
                    {lineas.map(l => (
                      <LineaProducto key={l.key} linea={l} sedeId={sedeId} sedeCodigo={sedeCodigo}
                        onChange={patch => setLinea(l.key, patch)}
                        onRemove={() => setLineas(ls => ls.filter(x => x.key !== l.key))} />
                    ))}
                  </div>
                ) : itemsElegidos.length === 0 && (
                  <p className="text-sm text-gray-400">Selecciona un pedido arriba o agrega un producto del inventario (búscalo por su código).</p>
                )}
              </div>

              {/* Información adicional + Crear artículo */}
              <div className="grid sm:grid-cols-[1.4fr_1fr] gap-4">
                <div className="bg-white rounded-xl border border-gray-100 p-4">
                  <p className="text-sm font-semibold text-gray-900 mb-3">Información adicional</p>
                  <div className="grid grid-cols-2 gap-3">
                    {sedes.length > 1 ? (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Sede</label>
                        <select value={sedeId} onChange={e => { setSedeId(e.target.value); setSeleccionados(new Set()) }} className={inputCls}>
                          {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Sede</label>
                        <input value={sedes[0]?.nombre ?? ''} disabled className={`${inputCls} bg-gray-50 text-gray-500`} />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Fecha factura</label>
                      <input value={formatFecha(hoy())} disabled className={`${inputCls} bg-gray-50 text-gray-500`} />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        Mensajería <span className="text-gray-400 font-normal">(opcional)</span>
                      </label>
                      <input type="text" value={mensajeria} onChange={e => setMensajeria(e.target.value)}
                        placeholder="Empresa o mensajero" className={inputCls} />
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-4 flex flex-col">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center text-blue-500 flex-none">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Crear artículo nuevo</p>
                      <p className="text-xs text-gray-500 mt-0.5">¿No existe? Agrégalo con su código; se guarda solo en el catálogo.</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => setLineas(ls => [...ls, nuevaLinea()])}
                    className="mt-3 self-start inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white border border-blue-200 text-blue-600 text-sm font-medium hover:bg-blue-50">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
                    Crear artículo
                  </button>
                </div>
              </div>

              {/* Todo listo */}
              {hayAlgo && (
                <div className="bg-green-50/60 border border-green-100 rounded-xl p-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600 flex-none">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Todo listo para emitir la factura</p>
                    <p className="text-xs text-gray-500">Revisa la información y haz clic en Emitir factura.</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ============ SIDEBAR DERECHA ============ */}
        <div className="space-y-4 lg:sticky lg:top-4">
          {/* Resumen */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <p className="text-sm font-semibold text-gray-900 mb-4">Resumen</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-500"><span>Subtotal</span><span className="text-gray-800">{formatCOP(subtotal)}</span></div>
              <div className="flex justify-between items-center text-gray-500">
                <span>Envío</span>
                <input type="text" inputMode="numeric" value={envio} onChange={e => setEnvio(e.target.value)} placeholder="0"
                  className="w-24 text-right rounded-lg border border-gray-200 px-2 py-1 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex justify-between items-center text-gray-500">
                <span>Descuento</span>
                <input type="text" inputMode="numeric" value={descuento} onChange={e => setDescuento(e.target.value)} placeholder="0"
                  className="w-24 text-right rounded-lg border border-gray-200 px-2 py-1 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex justify-between items-center pt-3 mt-3 border-t border-gray-100">
              <span className="text-sm font-semibold text-gray-900">Total venta</span>
              <span className="text-lg font-extrabold text-blue-600">{formatCOP(totalNeto)}</span>
            </div>
          </div>

          {/* Abono / saldo */}
          <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-5 space-y-2">
            <div className="flex justify-between text-sm"><span className="text-gray-600">Abono recibido</span><span className="font-bold text-blue-600">{formatCOP(abonoNum)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-600">Saldo pendiente</span><span className="font-bold text-rose-500">{formatCOP(saldo)}</span></div>
          </div>

          {/* Información de pago */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
            <p className="text-sm font-semibold text-gray-900">Información de pago</p>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={credito} onChange={e => setCredito(e.target.checked)} className="w-4 h-4 accent-blue-600" />
              A crédito (no recibe dinero ahora)
            </label>

            {!credito && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Monto recibido (opcional)</label>
                  <div className="flex gap-2">
                    <input type="text" inputMode="numeric" value={abono} onChange={e => setAbono(e.target.value)} placeholder="0" className={inputCls} />
                    <button type="button" onClick={() => setAbono(String(totalNeto))}
                      className="rounded-lg bg-gray-100 text-gray-700 px-3 text-xs font-medium hover:bg-gray-200 whitespace-nowrap">Pagó todo</button>
                  </div>
                </div>
                {cuentas.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Cuenta destino <span className="text-gray-400 font-normal">(dónde llega)</span></label>
                    <select value={cuentaId || ''} onChange={e => setCuentaId(e.target.value || null)} className={inputCls}>
                      <option value="">Sin especificar</option>
                      {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </div>
                )}
              </>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Fecha de vencimiento</label>
              <input type="date" value={vence} onChange={e => setVence(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Asesor</label>
              <input value={asesorNombre} disabled className={`${inputCls} bg-gray-50 text-gray-500`} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Notas (opcional)</label>
              <input type="text" value={notas} onChange={e => setNotas(e.target.value)} className={inputCls} />
            </div>

            {credito && (
              <p className="text-xs text-amber-600">🕓 A crédito: el cliente queda debiendo el total. Queda en cartera.</p>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button onClick={crear} disabled={pending || !hayAlgo} className="w-full">
            {pending ? 'Emitiendo factura…' : `Emitir factura · ${formatCOP(totalNeto)}`}
          </Button>
        </div>
      </div>
    </div>
  )
}
