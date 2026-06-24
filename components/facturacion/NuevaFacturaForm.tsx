'use client'

import { useState, useEffect, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { buscarClientesAction, ClienteBusqueda } from '@/app/actions/clientes'
import {
  getPedidosFacturablesAction, crearFacturaUnificadaAction, buscarPedidoFacturableAction, PedidoFacturable,
} from '@/app/actions/facturacion'
import { getCuentasAction } from '@/app/actions/cuentas'
import { formatCOP, formatFecha } from '@/lib/utils/format'
import { MetodoPago, PagoFacturaInput, TipoEntrega, QuienPagaEntrega, TipoMensajeria, MENSAJERIA_LABELS } from '@/types'
import type { Cuenta } from '@/types'
import { Linea, nuevaLinea, LineaProducto } from '@/components/ventas/LineaProducto'

type SedeOpcion = { id: string; codigo: string; nombre: string }

function venceDefault() {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toISOString().slice(0, 10)
}

const inputCls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export function NuevaFacturaForm({ sedes, asesorNombre = '' }: { sedes: SedeOpcion[]; asesorNombre?: string }) {
  const router = useRouter()

  const [sedeId, setSedeId] = useState(sedes[0]?.id ?? '')
  const sedeActual = sedes.find(s => s.id === sedeId)
  const sedeCodigo = sedeActual?.codigo ?? ''

  // Cliente
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState<ClienteBusqueda[]>([])
  const [cliente, setCliente] = useState<ClienteBusqueda | null>(null)
  const [pedidoRef, setPedidoRef] = useState('')   // número del pedido buscado (para mostrar "Pedido encontrado")

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
    setMostrarNuevo(false)
  }

  // Config factura
  const [vence, setVence] = useState(venceDefault())
  const [abonos, setAbonos] = useState<PagoFacturaInput[]>([])
  const [esCredito, setEsCredito] = useState(false)
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [envio, setEnvio] = useState('')
  const [descuento, setDescuento] = useState('')
  const [mensajeria, setMensajeria] = useState('')
  const [notas, setNotas] = useState('')

  // Tipo de entrega (domicilio / envío)
  const [tipoEntrega, setTipoEntrega] = useState<TipoEntrega>('tienda')
  const [mensajeriaEntrega, setMensajeriaEntrega] = useState<TipoMensajeria>('servigo')
  const [valorEntrega, setValorEntrega] = useState('')
  const [quienPagaDom, setQuienPagaDom] = useState<'cliente' | 'tb'>('cliente')
  const [quienPagaEnvio, setQuienPagaEnvio] = useState<QuienPagaEntrega>('cliente')

  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  useEffect(() => {
    getCuentasAction().then(lista => {
      setCuentas(lista)
    })
  }, [])

  useEffect(() => {
    if (cliente) return
    const t = setTimeout(async () => {
      if (busqueda.trim().length < 2) { setResultados([]); return }
      setResultados(await buscarClientesAction(busqueda))
    }, 250)
    return () => clearTimeout(t)
  }, [busqueda, cliente])

  async function elegirCliente(c: ClienteBusqueda, preseleccion?: string, numeroPedido?: string) {
    setCliente(c)
    setResultados([])
    setBusqueda(c.nombre)
    setPedidoRef(numeroPedido ?? '')
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
      numPedido.trim().toUpperCase(),
    )
  }

  function reset() {
    setCliente(null); setPedidos([]); setSeleccionados(new Set()); setLineas([]); setBusqueda('')
    setMostrarNuevo(false); setNNombre(''); setNTelefono(''); setNCedula('')
    setNumPedido(''); setPedidoRef(''); setError('')
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
  const totalPedidos    = pedidosElegidos.reduce((s, p) => s + p.saldo, 0)
  const lineasValidas   = lineas.filter(l => l.descripcion.trim() && l.precio_venta > 0)
  const totalProductos  = lineasValidas.reduce((s, l) => s + l.precio_venta * l.cantidad, 0)
  const subtotal        = totalPedidos + totalProductos
  const envioNum        = parseInt(envio.replace(/\D/g, '')) || 0
  const descuentoNum    = parseInt(descuento.replace(/\D/g, '')) || 0
  const totalNeto       = Math.max(0, subtotal + envioNum - descuentoNum)
  const hayAlgo         = pedidosElegidos.length > 0 || lineasValidas.length > 0

  const abonoNum        = esCredito ? 0 : abonos.reduce((sum, a) => sum + a.monto, 0)
  const saldoPendiente  = Math.max(0, totalNeto - abonoNum)

  // ── Entrega: cuánto cobra el mensajero ──
  const valorEntregaNum = parseInt(valorEntrega.replace(/\D/g, '')) || 0
  // El recaudo es explícito: la suma de las líneas con método "Recaudo Mensajería".
  const recaudoMensajeria = esCredito ? 0 : abonos
    .filter(a => a.metodo === 'recaudo_mensajeria')
    .reduce((s, a) => s + a.monto, 0)
  // El mensajero cobra el recaudo; si es domicilio y lo paga el cliente, suma el domicilio.
  const cobraMensajero  = recaudoMensajeria
    + (tipoEntrega === 'domicilio' && quienPagaDom === 'cliente' ? valorEntregaNum : 0)

  function agregarAbono() {
    setAbonos([...abonos, {monto: 0, metodo: 'efectivo', cuenta_id: null}])
  }

  function eliminarAbono(idx: number) {
    setAbonos(abonos.filter((_, i) => i !== idx))
  }

  function actualizarAbono(idx: number, patch: Partial<PagoFacturaInput>) {
    const nuevos = [...abonos]
    nuevos[idx] = {...nuevos[idx], ...patch}
    setAbonos(nuevos)
  }

  function crear() {
    if (!cliente) { setError('Selecciona un cliente'); return }
    if (!hayAlgo) { setError('Agrega al menos un pedido o un producto'); return }
    if (abonoNum > totalNeto) { setError('El pago no puede superar el total'); return }
    // Validar que cada abono con cuenta bancaria tenga cuenta (efectivo y recaudo no la necesitan)
    if (!esCredito && abonos.some(a => a.monto > 0 && a.metodo !== 'efectivo' && a.metodo !== 'recaudo_mensajeria' && !a.cuenta_id)) {
      setError('Selecciona la cuenta para cada método de pago'); return
    }
    // Validar que cada recaudo mensajería tenga mensajería asignada
    if (!esCredito && abonos.some(a => a.monto > 0 && a.metodo === 'recaudo_mensajeria' && !a.mensajeria)) {
      setError('Selecciona la mensajería que recauda en cada línea de Recaudo Mensajería'); return
    }
    setError('')

    const notasFinal = mensajeria.trim()
      ? `${notas.trim() ? notas.trim() + ' · ' : ''}Mensajería: ${mensajeria.trim()}`
      : notas

    start(async () => {
      const esNuevo = cliente.id === '__nuevo__'
      const r = await crearFacturaUnificadaAction({
        cliente_id: esNuevo ? null : cliente.id,
        cliente_nuevo: esNuevo ? { nombre: cliente.nombre, telefono: cliente.telefono_normalizado, cedula: cliente.cedula ?? '' } : null,
        sede_id: sedeId,
        pedido_ids: pedidosElegidos.map(p => p.id),
        productos_nuevos: lineasValidas.map(({ articulo_id, marca, descripcion, talla, cantidad, precio_venta, color, sexo, categoria }) => ({
          articulo_id, marca, descripcion, talla, cantidad, precio_venta, color, sexo, categoria,
        })),
        fecha_vencimiento: vence,
        abonos: esCredito ? [] : abonos.filter(a => a.monto > 0),
        envio: envioNum,
        descuento: descuentoNum,
        notas: notasFinal,
        tipo_entrega: tipoEntrega,
        mensajeria_entrega: tipoEntrega === 'domicilio' ? mensajeriaEntrega : null,
        valor_entrega: tipoEntrega === 'tienda' ? 0 : valorEntregaNum,
        quien_paga_entrega: tipoEntrega === 'domicilio' ? quienPagaDom
          : tipoEntrega === 'envio' ? quienPagaEnvio : null,
        direccion_entrega: tipoEntrega === 'domicilio' ? (cliente.ultima_direccion ?? null) : null,
      })
      if (!r.ok) { setError(r.error); return }
      router.push(`/facturacion/${r.facturaId}`)
    })
  }

  const puedeEmitir = !!cliente && hayAlgo && !pending

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Facturar</h1>
          <p className="text-sm text-gray-500">Crea y emite la factura de venta</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/facturacion"
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Ver facturas emitidas
          </Link>
          <button type="button" onClick={crear} disabled={!puedeEmitir}
            className="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {pending ? 'Emitiendo…' : 'Emitir factura'}
          </button>
        </div>
      </div>

      {/* Buscadores */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Buscar pedido</label>
          <div className="flex gap-2">
            <input type="text" value={numPedido} onChange={e => setNumPedido(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && buscarPorPedido()} placeholder="N° de pedido (ej: TR1234)"
              className={inputCls} />
            <button type="button" onClick={buscarPorPedido} disabled={buscandoPedido || !numPedido.trim()}
              className="rounded-lg bg-blue-600 text-white px-3 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {buscandoPedido ? '…' : '🔍'}
            </button>
          </div>
        </div>
        <div className="relative">
          <label className="block text-xs font-medium text-gray-500 mb-1">O buscar cliente</label>
          <input type="text" value={busqueda}
            onChange={e => { setBusqueda(e.target.value); if (cliente) reset() }}
            placeholder="Nombre o teléfono…" className={inputCls} />
          {!cliente && resultados.length > 0 && (
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
          className="rounded-lg bg-blue-50 text-blue-700 px-4 py-2 text-sm font-semibold hover:bg-blue-100 whitespace-nowrap">
          + Nuevo cliente
        </button>
      </div>

      {/* Panel cliente nuevo */}
      {mostrarNuevo && !cliente && (
        <div className="bg-white rounded-xl border border-blue-200 p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-900">Datos del cliente nuevo</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input type="text" value={nNombre} onChange={e => setNNombre(e.target.value)} placeholder="Nombre" className={inputCls} />
            <input type="text" value={nTelefono} onChange={e => setNTelefono(e.target.value)} placeholder="Teléfono" className={inputCls} />
            <input type="text" value={nCedula} onChange={e => setNCedula(e.target.value)} placeholder="Cédula (opcional)" className={inputCls} />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={usarClienteNuevo}
              className="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-semibold hover:bg-blue-700">Continuar</button>
            <button type="button" onClick={() => setMostrarNuevo(false)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancelar</button>
          </div>
        </div>
      )}

      {/* Sede (solo admin / multi-sede) */}
      {sedes.length > 1 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <label className="block text-xs font-medium text-gray-500 mb-1">Sede</label>
          <select value={sedeId} onChange={e => { setSedeId(e.target.value); setSeleccionados(new Set()) }} className={inputCls}>
            {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
      )}

      {!cliente ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-10 text-center">
          <p className="text-sm text-gray-400">Busca un pedido por su número o un cliente para comenzar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* ── Columna izquierda ── */}
          <div className="lg:col-span-2 space-y-5">
            {/* Cliente */}
            <div className="bg-white rounded-xl border border-gray-100 p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 flex-none">👤</div>
              <div className="flex-1">
                <p className="text-[11px] font-semibold text-gray-400 uppercase">Cliente</p>
                <p className="font-bold text-gray-900">{cliente.nombre}</p>
                <p className="text-xs text-gray-500">
                  {cliente.telefono_normalizado}{sedeCodigo && ` · ${sedeCodigo}`}
                </p>
              </div>
              {pedidoRef && (
                <div className="border-l border-gray-100 pl-4">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase flex items-center gap-1.5">
                    Pedido <span className="text-green-600 normal-case font-medium bg-green-50 rounded px-1.5 py-0.5">Pedido encontrado</span>
                  </p>
                  <p className="font-bold text-gray-900 font-mono mt-0.5">{pedidoRef}</p>
                </div>
              )}
              <button type="button" onClick={reset} className="text-sm font-medium text-gray-500 hover:text-gray-700 flex-none">Cambiar</button>
            </div>

            {/* Pedidos sin facturar */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <p className="text-sm font-bold text-gray-900 mb-3">Pedidos sin facturar</p>
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
                      <input type="checkbox" checked={seleccionados.has(p.id)} onChange={() => toggle(p.id)} className="w-4 h-4 accent-blue-600" />
                      <div className="flex-1">
                        <p className="font-mono text-sm font-medium text-gray-900">{p.numero_orden}</p>
                        <p className="text-xs text-gray-400">{formatFecha(p.fecha_creacion)}</p>
                      </div>
                      <div className="text-right text-xs leading-relaxed">
                        <p className="text-gray-500">Abonado: <span className="font-semibold text-green-600">{formatCOP(p.abonado)}</span></p>
                        <p className="text-gray-900 font-bold text-sm">Falta: {formatCOP(p.saldo)}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Productos */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold text-gray-900">Productos</p>
                <button type="button" onClick={() => setLineas(ls => [...ls, nuevaLinea()])}
                  className="text-sm font-medium text-blue-600 hover:underline">+ Agregar producto</button>
              </div>
              {lineas.length === 0 ? (
                <p className="text-sm text-gray-400">Agrega productos del inventario que se vendan en el momento.</p>
              ) : (
                <div className="space-y-3">
                  {lineas.map(l => (
                    <LineaProducto key={l.key} linea={l} sedeId={sedeId} sedeCodigo={sedeCodigo}
                      onChange={patch => setLinea(l.key, patch)}
                      onRemove={() => setLineas(ls => ls.filter(x => x.key !== l.key))} />
                  ))}
                </div>
              )}
            </div>

            {/* Información adicional + Crear artículo */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
                <p className="text-sm font-bold text-gray-900">Información adicional</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Sede</label>
                    <input type="text" readOnly value={sedeActual ? `${sedeActual.nombre} (${sedeActual.codigo})` : ''}
                      className={`${inputCls} bg-gray-50 text-gray-600`} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Fecha factura</label>
                    <input type="text" readOnly value={formatFecha(new Date().toISOString().slice(0, 10))}
                      className={`${inputCls} bg-gray-50 text-gray-600`} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Mensajería (opcional)</label>
                  <input type="text" value={mensajeria} onChange={e => setMensajeria(e.target.value)}
                    placeholder="Empresa o mensajero" className={inputCls} />
                </div>
              </div>

              <div className="bg-blue-50/50 rounded-xl border border-blue-100 p-5">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 flex-none">📦</div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">Crear artículo nuevo</p>
                    <p className="text-xs text-gray-500 mt-0.5">¿No existe? Agrégalo con su código; se guarda solo en el catálogo.</p>
                  </div>
                </div>
                <button type="button" onClick={() => setLineas(ls => [...ls, nuevaLinea()])}
                  className="mt-3 rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50">
                  + Crear artículo
                </button>
              </div>
            </div>

            {/* Banner listo */}
            {hayAlgo && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center text-green-600 flex-none">✓</div>
                <div>
                  <p className="text-sm font-semibold text-green-800">Todo listo para emitir la factura</p>
                  <p className="text-xs text-green-600">Revisa la información y haz clic en Emitir factura.</p>
                </div>
              </div>
            )}
          </div>

          {/* ── Columna derecha ── */}
          <div className="space-y-5">
            {/* Resumen */}
            <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
              <p className="text-sm font-bold text-gray-900">Resumen</p>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="font-medium text-gray-900">{formatCOP(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Envío</span>
                <input type="text" inputMode="numeric" value={envio} onChange={e => setEnvio(e.target.value.replace(/\D/g, ''))}
                  placeholder="0" className="w-28 text-right rounded-lg border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Descuento</span>
                <input type="text" inputMode="numeric" value={descuento} onChange={e => setDescuento(e.target.value.replace(/\D/g, ''))}
                  placeholder="0" className="w-28 text-right rounded-lg border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <span className="text-sm font-bold text-gray-900">Total venta</span>
                <span className="text-xl font-bold text-blue-600">{formatCOP(totalNeto)}</span>
              </div>
            </div>

            {/* Abono / Saldo */}
            <div className="bg-blue-50/60 rounded-xl border border-blue-100 p-5 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Abono recibido</span>
                <span className="font-bold text-blue-600">{formatCOP(abonoNum)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Saldo pendiente</span>
                <span className={`font-bold ${saldoPendiente > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCOP(saldoPendiente)}</span>
              </div>
              {recaudoMensajeria > 0 && (
                <div className="flex items-center justify-between text-xs pt-2 border-t border-blue-100">
                  <span className="text-amber-600">🛵 Lo recauda la mensajería</span>
                  <span className="font-semibold text-amber-600">{formatCOP(recaudoMensajeria)}</span>
                </div>
              )}
            </div>

            {/* Información de pago */}
            <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
              <p className="text-sm font-bold text-gray-900">Información de pago</p>

              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={esCredito} onChange={e => { setEsCredito(e.target.checked); if (e.target.checked) setAbonos([]) }}
                  className="w-4 h-4 accent-blue-600" />
                A crédito (no recibe dinero ahora)
              </label>

              {!esCredito && (
                <>
                  {/* Múltiples abonos */}
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-gray-700">Abonos (opcional)</label>
                    {abonos.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">Sin abonos (a crédito)</p>
                    ) : (
                      <div className="space-y-2">
                        {abonos.map((abono, idx) => (
                          <div key={idx} className="space-y-1.5">
                            <div className="flex gap-2 items-end">
                              {/* Monto */}
                              <div className="flex-1">
                                <label className="block text-xs text-gray-500 mb-1">Monto</label>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={abono.monto || ''}
                                  onChange={e => actualizarAbono(idx, {monto: parseInt(e.target.value.replace(/\D/g, ''), 10) || 0})}
                                  placeholder="0"
                                  className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              {/* Método/Cuenta */}
                              <div className="flex-1">
                                <label className="block text-xs text-gray-500 mb-1">Método</label>
                                <select
                                  value={abono.metodo === 'recaudo_mensajeria' ? '__recaudo__' : (abono.cuenta_id || '')}
                                  onChange={e => {
                                    if (e.target.value === '__recaudo__') {
                                      actualizarAbono(idx, {
                                        cuenta_id: null,
                                        metodo: 'recaudo_mensajeria',
                                        mensajeria: abono.mensajeria ?? 'servigo',
                                      })
                                      return
                                    }
                                    const cuenta = cuentas.find(c => c.id === e.target.value)
                                    if (cuenta) {
                                      actualizarAbono(idx, {
                                        cuenta_id: cuenta.id,
                                        metodo: cuenta.metodo_pago as MetodoPago,
                                        mensajeria: null,
                                      })
                                    } else if (e.target.value === '') {
                                      actualizarAbono(idx, {
                                        cuenta_id: null,
                                        metodo: 'efectivo',
                                        mensajeria: null,
                                      })
                                    }
                                  }}
                                  className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                  <option value="">Efectivo</option>
                                  {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                  <option value="__recaudo__">Recaudo Mensajería</option>
                                </select>
                              </div>
                              {/* Eliminar */}
                              <button
                                type="button"
                                onClick={() => eliminarAbono(idx)}
                                className="text-red-500 hover:text-red-700 px-2 py-1.5 text-sm"
                              >
                                ✕
                              </button>
                            </div>
                            {/* Sub-selector de mensajería para recaudo */}
                            {abono.metodo === 'recaudo_mensajeria' && (
                              <div className="flex items-center gap-2 pl-1">
                                <span className="text-xs text-gray-500">🛵 Recauda:</span>
                                <select
                                  value={abono.mensajeria ?? 'servigo'}
                                  onChange={e => actualizarAbono(idx, {mensajeria: e.target.value as TipoMensajeria})}
                                  className="rounded-lg border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                  {(Object.keys(MENSAJERIA_LABELS) as TipoMensajeria[]).map(m => (
                                    <option key={m} value={m}>{MENSAJERIA_LABELS[m]}</option>
                                  ))}
                                </select>
                                <span className="text-xs text-gray-400">la cobra al cliente y se la debe a TB</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={agregarAbono}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium mt-2"
                    >
                      + Agregar abono
                    </button>
                    {abonoNum > totalNeto && (
                      <p className="text-xs text-red-600 mt-1">
                        La suma ({formatCOP(abonoNum)}) no puede exceder el total ({formatCOP(totalNeto)})
                      </p>
                    )}
                  </div>

                  {/* Botón "Pagó todo" */}
                  {abonoNum < totalNeto && (
                    <button
                      type="button"
                      onClick={() => {
                        if (abonos.length === 0) {
                          agregarAbono()
                        }
                        const nuevos = [...abonos]
                        nuevos[0] = {...nuevos[0], monto: totalNeto}
                        setAbonos(nuevos)
                      }}
                      className="w-full rounded-lg bg-gray-100 text-gray-700 px-3 py-1.5 text-xs font-medium hover:bg-gray-200"
                    >
                      Pagó todo ({formatCOP(totalNeto)})
                    </button>
                  )}
                </>
              )}

              <div>
                <label className="block text-xs text-gray-500 mb-1">Fecha de vencimiento</label>
                <input type="date" value={vence} onChange={e => setVence(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Asesor</label>
                <input type="text" readOnly value={asesorNombre} className={`${inputCls} bg-gray-50 text-gray-600`} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Notas (opcional)</label>
                <input type="text" value={notas} onChange={e => setNotas(e.target.value)} className={inputCls} />
              </div>

              {esCredito && (
                <p className="text-xs text-amber-600">🕓 A crédito: el cliente queda debiendo el total. No entra dinero ahora; queda en cartera.</p>
              )}
            </div>

            {/* Tipo de entrega */}
            <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
              <p className="text-sm font-bold text-gray-900">Tipo de entrega</p>

              <div className="grid grid-cols-3 gap-1.5 p-1 bg-gray-100 rounded-lg">
                {([
                  ['tienda', 'Tienda'],
                  ['domicilio', 'Domicilio'],
                  ['envio', 'Envío'],
                ] as [TipoEntrega, string][]).map(([val, label]) => (
                  <button key={val} type="button" onClick={() => setTipoEntrega(val)}
                    className={`rounded-md py-2 text-xs font-medium transition-colors ${
                      tipoEntrega === val ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-200'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>

              {/* DOMICILIO */}
              {tipoEntrega === 'domicilio' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Mensajería</label>
                      <select value={mensajeriaEntrega} onChange={e => setMensajeriaEntrega(e.target.value as TipoMensajeria)} className={inputCls}>
                        {(Object.keys(MENSAJERIA_LABELS) as TipoMensajeria[]).map(m => (
                          <option key={m} value={m}>{MENSAJERIA_LABELS[m]}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Valor domicilio</label>
                      <input type="text" inputMode="numeric" value={valorEntrega}
                        onChange={e => setValorEntrega(e.target.value.replace(/\D/g, ''))}
                        placeholder="0" className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <p className="block text-xs text-gray-500 mb-1.5">¿Quién paga el domicilio?</p>
                    <div className="grid grid-cols-2 gap-2">
                      {([['cliente', 'Cliente'], ['tb', 'Tres Bandas']] as ['cliente' | 'tb', string][]).map(([val, label]) => (
                        <button key={val} type="button" onClick={() => setQuienPagaDom(val)}
                          className={`rounded-lg border-2 py-2 text-sm font-medium transition-colors ${
                            quienPagaDom === val ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Instrucción al mensajero (en vivo) */}
                  <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3">
                    <p className="text-[11px] font-semibold text-indigo-400 uppercase mb-1">💬 Instrucción al mensajero</p>
                    {cobraMensajero > 0 ? (
                      <>
                        <p className="text-sm font-bold text-indigo-800">Cobrar al cliente: {formatCOP(cobraMensajero)}</p>
                        {recaudoMensajeria > 0 && valorEntregaNum > 0 && quienPagaDom === 'cliente' ? (
                          <p className="text-xs text-indigo-500 mt-0.5">{formatCOP(recaudoMensajeria)} recaudo + {formatCOP(valorEntregaNum)} domicilio</p>
                        ) : recaudoMensajeria === 0 ? (
                          <p className="text-xs text-indigo-500 mt-0.5">Solo el domicilio</p>
                        ) : null}
                      </>
                    ) : (
                      <p className="text-sm font-bold text-green-700">No cobrar · solo entregar</p>
                    )}
                    {!esCredito && recaudoMensajeria === 0 && (
                      <p className="text-[11px] text-indigo-400 mt-1">Agrega un abono con método "Recaudo Mensajería" si el mensajero cobra el pedido al cliente.</p>
                    )}
                  </div>
                </div>
              )}

              {/* ENVÍO */}
              {tipoEntrega === 'envio' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Valor envío</label>
                    <input type="text" inputMode="numeric" value={valorEntrega}
                      onChange={e => setValorEntrega(e.target.value.replace(/\D/g, ''))}
                      placeholder="0" className={inputCls} />
                  </div>
                  <div>
                    <p className="block text-xs text-gray-500 mb-1.5">¿Quién paga el envío?</p>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        ['cliente', 'Cliente'],
                        ['contra_entrega', 'Contra entrega'],
                        ['tb', 'Tres Bandas'],
                      ] as [QuienPagaEntrega, string][]).map(([val, label]) => (
                        <button key={val} type="button" onClick={() => setQuienPagaEnvio(val)}
                          className={`rounded-lg border-2 px-1 py-2 text-xs font-medium transition-colors ${
                            quienPagaEnvio === val ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {quienPagaEnvio === 'contra_entrega' && (
                    <p className="text-xs text-gray-500">El cliente paga el envío al recibir. Solo queda el registro operativo.</p>
                  )}
                </div>
              )}
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button type="button" onClick={crear} disabled={!puedeEmitir}
              className="w-full rounded-lg bg-blue-600 text-white py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {pending ? 'Emitiendo…' : `Emitir factura · ${formatCOP(totalNeto)}`}
            </button>
          </div>
        </div>
      )}

      {error && !cliente && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
