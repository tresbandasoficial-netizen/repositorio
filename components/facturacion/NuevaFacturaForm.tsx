'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { buscarClientesAction, ClienteBusqueda } from '@/app/actions/clientes'
import {
  getPedidosFacturablesAction, crearFacturaUnificadaAction, buscarPedidoFacturableAction, PedidoFacturable,
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

  // Cliente nuevo
  const [mostrarNuevo, setMostrarNuevo] = useState(false)
  const [nNombre, setNNombre] = useState('')
  const [nTelefono, setNTelefono] = useState('')
  const [nCedula, setNCedula] = useState('')

  function usarClienteNuevo() {
    if (!nNombre.trim()) { setError('Escribe el nombre del cliente'); return }
    if (!nTelefono.trim()) { setError('Escribe el teléfono del cliente'); return }
    setError('')
    setCliente({ id: '__nuevo__', nombre: nNombre.trim(), telefono_normalizado: nTelefono.trim(), cedula: nCedula.trim() || null, ultima_direccion: null })
    setPedidos([])
    setSeleccionados(new Set())
  }

  // Config factura
  const [vence, setVence] = useState(venceDefault())
  const [abono, setAbono] = useState('')
  const [cuentaId, setCuentaId] = useState<string | null>(null)
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [credito, setCredito] = useState(false)
  const [envio, setEnvio] = useState('')
  const [descuento, setDescuento] = useState('')
  const [notas, setNotas] = useState('')

  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  useEffect(() => {
    getCuentasAction().then(setCuentas).catch(console.error)
  }, [])

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
    setMostrarNuevo(false); setNNombre(''); setNTelefono(''); setNCedula('')
    setEnvio(''); setDescuento(''); setAbono(''); setCredito(false)
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
  const subtotal = totalPedidos + totalProductos
  const envioNum = parseCOP(envio)
  const descuentoNum = parseCOP(descuento)
  const totalNeto = Math.max(0, subtotal + envioNum - descuentoNum)
  const abonoNum = credito ? 0 : parseCOP(abono)
  const saldo = Math.max(0, totalNeto - abonoNum)
  const hayAlgo = pedidosElegidos.length > 0 || lineasValidas.length > 0

  function crear() {
    if (!cliente) return
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

  // ─────────────────────────────────────────────────────────────
  // Estado inicial: aún no hay cliente → buscador de pedido/cliente
  // ─────────────────────────────────────────────────────────────
  if (!cliente) {
    return (
      <div className="space-y-5 max-w-2xl">
        {sedes.length > 1 && (
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <label className="block text-sm font-semibold text-gray-900 mb-2">Sede</label>
            <select value={sedeId} onChange={e => { setSedeId(e.target.value); setSeleccionados(new Set()) }}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
        )}

        {/* Es un pedido → buscar por número */}
        <div className="bg-blue-50 rounded-xl border border-blue-100 p-5">
          <label className="block text-sm font-semibold text-gray-900 mb-1">¿Es un pedido?</label>
          <p className="text-xs text-gray-500 mb-2">Búscalo por su número y lo facturamos.</p>
          <div className="flex gap-2">
            <input type="text" value={numPedido} onChange={e => setNumPedido(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && buscarPorPedido()} placeholder="N° de pedido (ej: TR1234)"
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <Button onClick={buscarPorPedido} disabled={buscandoPedido || !numPedido.trim()}>
              {buscandoPedido ? 'Buscando…' : 'Buscar'}
            </Button>
          </div>
        </div>

        {/* No es pedido → buscar cliente */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <label className="block text-sm font-semibold text-gray-900 mb-1">¿No es un pedido?</label>
          <p className="text-xs text-gray-500 mb-2">Busca el cliente y luego agrégale artículos del inventario.</p>
          {mostrarNuevo ? (
            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input type="text" value={nNombre} onChange={e => setNNombre(e.target.value)} placeholder="Nombre"
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input type="text" value={nTelefono} onChange={e => setNTelefono(e.target.value)} placeholder="Teléfono"
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input type="text" value={nCedula} onChange={e => setNCedula(e.target.value)} placeholder="Cédula (opcional)"
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex gap-2">
                <Button onClick={usarClienteNuevo}>Continuar</Button>
                <Button variant="ghost" onClick={() => setMostrarNuevo(false)}>Cancelar</Button>
              </div>
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
              <button type="button" onClick={() => { setMostrarNuevo(true); setError('') }}
                className="text-sm text-blue-600 hover:underline mt-2">
                + El cliente es nuevo (agregar datos)
              </button>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────
  // Cliente elegido: layout de dos columnas (contenido + resumen)
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-5 items-start">
      {/* ====================== COLUMNA IZQUIERDA ====================== */}
      <div className="space-y-4">
        {/* Cliente */}
        <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 flex-none">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0112 0v1"/></svg>
          </div>
          <div className="flex-1">
            <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Cliente</p>
            <p className="font-semibold text-gray-900">{cliente.nombre}</p>
            <p className="text-xs text-gray-400">{cliente.telefono_normalizado}{sedes.length > 1 ? ` · ${sedeCodigo}` : ''}</p>
          </div>
          <Button variant="ghost" onClick={reset}>Cambiar</Button>
        </div>

        {/* Sede (si hay varias) */}
        {sedes.length > 1 && (
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <label className="block text-xs font-medium text-gray-500 mb-1">Sede</label>
            <select value={sedeId} onChange={e => { setSedeId(e.target.value); setSeleccionados(new Set()) }}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
        )}

        {/* Pedidos del cliente */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
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
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold text-gray-900">Productos del inventario</p>
            <button type="button" onClick={() => setLineas(ls => [...ls, nuevaLinea()])}
              className="text-sm text-blue-600 font-medium hover:underline">+ Agregar producto</button>
          </div>
          <p className="text-xs text-gray-400 mb-3">Se venden en el momento; se descuentan del stock de {sedeCodigo}.</p>
          {lineas.length > 0 ? (
            <div className="space-y-3">
              {lineas.map(l => (
                <LineaProducto key={l.key} linea={l} sedeId={sedeId} sedeCodigo={sedeCodigo}
                  onChange={patch => setLinea(l.key, patch)}
                  onRemove={() => setLineas(ls => ls.filter(x => x.key !== l.key))} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">Sin productos agregados. Escribe el código para buscar en el catálogo.</p>
          )}
        </div>
      </div>

      {/* ====================== SIDEBAR DERECHA ====================== */}
      <div className="space-y-4 lg:sticky lg:top-4">
        {/* Resumen */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-sm font-semibold text-gray-900 mb-4">Resumen</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-500">
              <span>Subtotal</span><span className="text-gray-800">{formatCOP(subtotal)}</span>
            </div>
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
        {hayAlgo && (
          <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-5 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Abono recibido</span>
              <span className="font-bold text-blue-600">{formatCOP(abonoNum)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Saldo pendiente</span>
              <span className="font-bold text-rose-500">{formatCOP(saldo)}</span>
            </div>
          </div>
        )}

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
                  <input type="text" inputMode="numeric" value={abono} onChange={e => setAbono(e.target.value)} placeholder="0"
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <button type="button" onClick={() => setAbono(String(totalNeto))}
                    className="rounded-lg bg-gray-100 text-gray-700 px-3 text-xs font-medium hover:bg-gray-200 whitespace-nowrap">
                    Pagó todo
                  </button>
                </div>
              </div>
              {cuentas.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Cuenta destino <span className="text-gray-400 font-normal">(dónde llega el dinero)</span>
                  </label>
                  <select value={cuentaId || ''} onChange={e => setCuentaId(e.target.value || null)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Sin especificar</option>
                    {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
              )}
            </>
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

          {credito && (
            <p className="text-xs text-amber-600">🕓 A crédito: el cliente queda debiendo el total. No entra dinero ahora; queda en cartera.</p>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button onClick={crear} disabled={pending || !hayAlgo} className="w-full">
          {pending ? 'Emitiendo factura…' : `Emitir factura · ${formatCOP(totalNeto)}`}
        </Button>
      </div>
    </div>
  )
}
