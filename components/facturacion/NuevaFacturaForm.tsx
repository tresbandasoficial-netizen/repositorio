'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { buscarClientesAction, ClienteBusqueda } from '@/app/actions/clientes'
import {
  getPedidosFacturablesAction, crearFacturaUnificadaAction, buscarPedidoFacturableAction, PedidoFacturable,
} from '@/app/actions/facturacion'
import { Button } from '@/components/ui/Button'
import { formatCOP, formatFecha } from '@/lib/utils/format'
import { MetodoPago, METODOS_PAGO, METODO_PAGO_LABELS } from '@/types'
import { Linea, nuevaLinea, LineaProducto } from '@/components/ventas/LineaProducto'

type SedeOpcion = { id: string; codigo: string; nombre: string }

function venceDefault() {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toISOString().slice(0, 10)
}

export function NuevaFacturaForm({ sedes }: { sedes: SedeOpcion[] }) {
  const router = useRouter()

  const [sedeId, setSedeId] = useState(sedes[0]?.id ?? '')
  const sedeCodigo = sedes.find(s => s.id === sedeId)?.codigo ?? ''

  // Cliente
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState<ClienteBusqueda[]>([])
  const [cliente, setCliente] = useState<ClienteBusqueda | null>(null)

  // Pedidos existentes
  const [pedidos, setPedidos] = useState<PedidoFacturable[]>([])
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [cargando, setCargando] = useState(false)

  // Productos nuevos del inventario
  const [lineas, setLineas] = useState<Linea[]>([])

  // Búsqueda por número de pedido
  const [numPedido, setNumPedido] = useState('')
  const [buscandoPedido, setBuscandoPedido] = useState(false)

  // Config factura
  const [vence, setVence] = useState(venceDefault())
  const [abono, setAbono] = useState('')
  const [metodo, setMetodo] = useState<MetodoPago>('efectivo')
  const [notas, setNotas] = useState('')

  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  useEffect(() => {
    if (cliente) return
    const t = setTimeout(async () => {
      if (busqueda.trim().length < 2) { setResultados([]); return }
      setResultados(await buscarClientesAction(busqueda))
    }, 250)
    return () => clearTimeout(t)
  }, [busqueda, cliente])

  async function elegirCliente(c: ClienteBusqueda, preseleccion?: string) {
    setCliente(c)
    setResultados([])
    setBusqueda(c.nombre)
    setCargando(true)
    const ped = await getPedidosFacturablesAction(c.id)
    setPedidos(ped)
    setSeleccionados(preseleccion ? new Set([preseleccion]) : new Set())
    setCargando(false)
  }

  async function buscarPorPedido() {
    if (!numPedido.trim()) return
    setBuscandoPedido(true)
    setError('')
    const r = await buscarPedidoFacturableAction(numPedido)
    setBuscandoPedido(false)
    if (!r.ok) { setError(r.error); return }
    await elegirCliente(
      { id: r.data.cliente_id, nombre: r.data.cliente_nombre, telefono_normalizado: r.data.cliente_telefono, cedula: null, ultima_direccion: null },
      r.data.pedido_id,
    )
  }

  function reset() {
    setCliente(null); setPedidos([]); setSeleccionados(new Set()); setLineas([]); setBusqueda('')
  }

  // Pedidos visibles = los de la sede seleccionada
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
  const totalNeto = totalPedidos + totalProductos
  const hayAlgo = pedidosElegidos.length > 0 || lineasValidas.length > 0

  function crear() {
    if (!cliente) return
    if (!hayAlgo) { setError('Agrega al menos un pedido o un producto'); return }
    // Crédito = se lo lleva fiado: no entra dinero, todo queda en cartera.
    const esCredito = metodo === 'credito'
    const ab = esCredito ? 0 : (abono ? parseInt(abono.replace(/\D/g, ''), 10) : 0)
    if (ab > totalNeto) { setError('El pago no puede superar el total'); return }
    setError('')
    start(async () => {
      const r = await crearFacturaUnificadaAction({
        cliente_id: cliente.id,
        sede_id: sedeId,
        pedido_ids: pedidosElegidos.map(p => p.id),
        productos_nuevos: lineasValidas.map(({ articulo_id, marca, descripcion, talla, cantidad, precio_venta }) => ({
          articulo_id, marca, descripcion, talla, cantidad, precio_venta,
        })),
        fecha_vencimiento: vence,
        abono_inicial: ab,
        metodo_abono: metodo,
        notas,
      })
      if (!r.ok) { setError(r.error); return }
      router.push(`/facturacion/${r.facturaId}`)
    })
  }

  return (
    <div className="space-y-5">
      {/* Sede */}
      {sedes.length > 1 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <label className="block text-sm font-semibold text-gray-900 mb-2">Sede</label>
          <select value={sedeId} onChange={e => { setSedeId(e.target.value); setSeleccionados(new Set()) }}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
      )}

      {/* Atajo por número de pedido */}
      {!cliente && (
        <div className="bg-blue-50 rounded-xl border border-blue-100 p-5">
          <label className="block text-sm font-semibold text-gray-900 mb-2">Facturar por número de pedido</label>
          <div className="flex gap-2">
            <input type="text" value={numPedido} onChange={e => setNumPedido(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && buscarPorPedido()} placeholder="Ej: TR1234"
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <Button onClick={buscarPorPedido} disabled={buscandoPedido || !numPedido.trim()}>
              {buscandoPedido ? 'Buscando…' : 'Buscar'}
            </Button>
          </div>
        </div>
      )}

      {/* Cliente */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <label className="block text-sm font-semibold text-gray-900 mb-2">
          {cliente ? 'Cliente' : '…o busca por cliente'}
        </label>
        {cliente ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">{cliente.nombre}</p>
              <p className="text-xs text-gray-400">{cliente.telefono_normalizado}</p>
            </div>
            <Button variant="ghost" onClick={reset}>Cambiar</Button>
          </div>
        ) : (
          <div className="relative">
            <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o teléfono…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {resultados.length > 0 && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
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
        )}
      </div>

      {cliente && (
        <>
          {/* Pedidos del cliente */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <p className="text-sm font-semibold text-gray-900 mb-3">Pedidos del cliente (sin facturar)</p>
            {cargando ? (
              <p className="text-sm text-gray-400">Cargando…</p>
            ) : pedidosSede.length === 0 ? (
              <p className="text-sm text-gray-400">No tiene pedidos pendientes de facturar en {sedeCodigo}.</p>
            ) : (
              <div className="space-y-2">
                {pedidosSede.map(p => (
                  <label key={p.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      seleccionados.has(p.id) ? 'border-blue-300 bg-blue-50' : 'border-gray-100 hover:bg-gray-50'
                    }`}>
                    <input type="checkbox" checked={seleccionados.has(p.id)} onChange={() => toggle(p.id)} className="w-4 h-4 accent-blue-600 self-start mt-1" />
                    <div className="flex-1">
                      <p className="font-mono text-sm text-gray-900">{p.numero_orden}</p>
                      <p className="text-xs text-gray-400">{formatFecha(p.fecha_creacion)}</p>
                    </div>
                    <div className="text-right text-xs leading-relaxed">
                      <p className="text-gray-500">Valor: <span className="font-medium text-gray-800">{formatCOP(p.total)}</span></p>
                      <p className="text-gray-500">Abonado: <span className="font-medium text-green-600">{formatCOP(p.abonado)}</span></p>
                      <p className="text-gray-900 font-bold text-sm">Falta: {formatCOP(p.saldo)}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Productos del inventario */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <p className="text-sm font-semibold text-gray-900 mb-1">Productos del inventario (opcional)</p>
            <p className="text-xs text-gray-400 mb-3">Agrega productos que se venden en el momento; se descuentan del stock de {sedeCodigo}.</p>
            {lineas.length > 0 && (
              <div className="space-y-3 mb-3">
                {lineas.map(l => (
                  <LineaProducto key={l.key} linea={l} sedeId={sedeId} sedeCodigo={sedeCodigo}
                    onChange={patch => setLinea(l.key, patch)}
                    onRemove={() => setLineas(ls => ls.filter(x => x.key !== l.key))} />
                ))}
              </div>
            )}
            <button type="button" onClick={() => setLineas(ls => [...ls, nuevaLinea()])}
              className="text-sm text-blue-600 hover:underline">+ Agregar producto del inventario</button>
          </div>

          {/* Config */}
          {hayAlgo && (
            <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <span className="text-sm text-gray-500">Total a facturar</span>
                <span className="text-lg font-bold text-gray-900">{formatCOP(totalNeto)}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Método de pago</label>
                  <select value={metodo} onChange={e => setMetodo(e.target.value as MetodoPago)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {METODOS_PAGO.map(m => <option key={m} value={m}>{METODO_PAGO_LABELS[m]}</option>)}
                  </select>
                </div>
                {metodo !== 'credito' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Monto recibido (opcional)</label>
                    <div className="flex gap-2">
                      <input type="text" inputMode="numeric" value={abono} onChange={e => setAbono(e.target.value)} placeholder="0"
                        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <button type="button" onClick={() => setAbono(String(totalNeto))}
                        className="rounded-lg bg-gray-100 text-gray-700 px-3 text-xs font-medium hover:bg-gray-200 whitespace-nowrap">
                        Pagó todo
                      </button>
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Fecha de vencimiento</label>
                  <input type="date" value={vence} onChange={e => setVence(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Notas (opcional)</label>
                  <input type="text" value={notas} onChange={e => setNotas(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              {metodo === 'credito' && (
                <p className="text-xs text-amber-600">🕓 A crédito: el cliente queda debiendo el total. No entra dinero ahora; queda en cartera.</p>
              )}

              {/* Resumen */}
              <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-100">
                <span className="text-gray-500">Queda en cartera (saldo)</span>
                <span className="font-bold text-gray-900">
                  {formatCOP(metodo === 'credito' ? totalNeto : Math.max(0, totalNeto - (abono ? parseInt(abono.replace(/\D/g, ''), 10) || 0 : 0)))}
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {cliente && (
        <Button onClick={crear} disabled={pending || !hayAlgo} className="w-full">
          {pending ? 'Creando factura…' : `Crear factura · ${formatCOP(totalNeto)}`}
        </Button>
      )}
    </div>
  )
}
