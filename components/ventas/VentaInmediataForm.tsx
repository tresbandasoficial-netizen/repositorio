'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { buscarClientesAction, ClienteBusqueda } from '@/app/actions/clientes'
import { registrarVentaInmediataAction } from '@/app/actions/ventas'
import { Button } from '@/components/ui/Button'
import { formatCOP } from '@/lib/utils/format'
import { MetodoPago, METODO_PAGO_LABELS, metodosDeSede } from '@/types'
import { Linea, nuevaLinea, LineaProducto } from '@/components/ventas/LineaProducto'

type SedeOpcion = { id: string; codigo: string; nombre: string }

export function VentaInmediataForm({ sedes }: { sedes: SedeOpcion[] }) {
  const router = useRouter()

  const [sedeId, setSedeId] = useState(sedes[0]?.id ?? '')
  const sedeCodigo = sedes.find(s => s.id === sedeId)?.codigo ?? ''

  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState<ClienteBusqueda[]>([])
  const [cliente, setCliente] = useState<ClienteBusqueda | null>(null)
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [cedula, setCedula] = useState('')

  const [lineas, setLineas] = useState<Linea[]>([nuevaLinea()])

  const [abono, setAbono] = useState('')
  const [metodo, setMetodo] = useState<MetodoPago>('efectivo')
  const [notas, setNotas] = useState('')
  const [pagaTodo, setPagaTodo] = useState(true)

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

  function elegirCliente(c: ClienteBusqueda) {
    setCliente(c)
    setNombre(c.nombre)
    setTelefono(c.telefono_normalizado)
    setCedula(c.cedula ?? '')
    setResultados([])
    setBusqueda(c.nombre)
  }

  function resetCliente() {
    setCliente(null); setBusqueda(''); setNombre(''); setTelefono(''); setCedula('')
  }

  function setLinea(key: number, patch: Partial<Linea>) {
    setLineas(ls => ls.map(l => l.key === key ? { ...l, ...patch } : l))
  }

  const total = lineas.reduce((s, l) => s + l.precio_venta * l.cantidad, 0)
  const abonoNum = pagaTodo ? total : (abono ? parseInt(abono.replace(/\D/g, ''), 10) || 0 : 0)

  function crear() {
    if (!nombre.trim()) { setError('El nombre del cliente es obligatorio'); return }
    if (!telefono.trim()) { setError('El teléfono del cliente es obligatorio'); return }
    const items = lineas.filter(l => l.descripcion.trim() && l.precio_venta > 0)
    if (items.length === 0) { setError('Agrega al menos un producto con precio'); return }
    if (abonoNum > total) { setError('El abono no puede superar el total'); return }
    setError('')

    start(async () => {
      const r = await registrarVentaInmediataAction({
        sede_id: sedeId,
        cliente_nombre: nombre,
        cliente_telefono: telefono,
        cliente_cedula: cedula,
        items: items.map(({ articulo_id, marca, descripcion, talla, cantidad, precio_venta, color, sexo, categoria }) => ({
          articulo_id, marca, descripcion, talla, cantidad, precio_venta, color, sexo, categoria,
        })),
        abono: abonoNum,
        metodo,
        cuenta_id: null,
        notas,
      })
      if (!r.ok) { setError(r.error); return }
      router.push(`/pedidos/${r.pedidoId}`)
    })
  }

  return (
    <div className="space-y-5">
      {sedes.length > 1 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <label className="block text-sm font-semibold text-gray-900 mb-2">Sede de venta</label>
          <select
            value={sedeId}
            onChange={e => setSedeId(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          <p className="text-xs text-gray-400 mt-1">El inventario se descuenta de esta sede.</p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <label className="block text-sm font-semibold text-gray-900 mb-2">Cliente</label>
        {!cliente && (
          <div className="relative mb-3">
            <input
              type="text"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar cliente existente…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre"
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input type="text" value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="Teléfono"
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input type="text" value={cedula} onChange={e => setCedula(e.target.value)} placeholder="Cédula (opcional)"
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        {cliente && (
          <button type="button" onClick={resetCliente} className="text-xs text-blue-600 hover:underline mt-2">
            Limpiar / nuevo cliente
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <label className="block text-sm font-semibold text-gray-900 mb-3">Productos</label>
        <div className="space-y-3">
          {lineas.map(l => (
            <LineaProducto
              key={l.key}
              linea={l}
              sedeId={sedeId}
              sedeCodigo={sedeCodigo}
              onChange={patch => setLinea(l.key, patch)}
              onRemove={lineas.length > 1 ? () => setLineas(ls => ls.filter(x => x.key !== l.key)) : undefined}
            />
          ))}
        </div>
        <button type="button" onClick={() => setLineas(ls => [...ls, nuevaLinea()])}
          className="text-sm text-blue-600 hover:underline mt-3">
          + Agregar producto
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-gray-100">
          <span className="text-sm text-gray-500">Total</span>
          <span className="text-lg font-bold text-gray-900">{formatCOP(total)}</span>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={pagaTodo} onChange={e => setPagaTodo(e.target.checked)} className="w-4 h-4 accent-blue-600" />
          Paga el total de contado
        </label>
        {!pagaTodo && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Abono (deja saldo en cartera)</label>
            <input type="text" inputMode="numeric" value={abono} onChange={e => setAbono(e.target.value)} placeholder="0"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <p className="text-xs text-gray-400 mt-1">Saldo pendiente: {formatCOP(Math.max(0, total - abonoNum))}</p>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Método de pago</label>
            <select
              value={metodo}
              onChange={e => setMetodo(e.target.value as MetodoPago)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {metodosDeSede(sedeCodigo).map(m => (
                <option key={m} value={m}>{METODO_PAGO_LABELS[m]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notas (opcional)</label>
            <input type="text" value={notas} onChange={e => setNotas(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button onClick={crear} disabled={pending || total <= 0} className="w-full">
        {pending ? 'Registrando venta…' : `Registrar venta · ${formatCOP(total)}`}
      </Button>
    </div>
  )
}
