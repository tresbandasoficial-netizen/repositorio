'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { buscarClientesAction, ClienteBusqueda } from '@/app/actions/clientes'
import { getPedidosFacturablesAction, crearFacturaAction, PedidoFacturable } from '@/app/actions/facturacion'
import { Button } from '@/components/ui/Button'
import { formatCOP, formatFecha } from '@/lib/utils/format'
import { MetodoPago } from '@/types'

const METODOS: { value: MetodoPago; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'datafono', label: 'Datáfono' },
  { value: 'addi', label: 'Addi' },
  { value: 'bold', label: 'Bold' },
  { value: 'sistecredito', label: 'Sistecrédito' },
  { value: 'otro', label: 'Otro' },
]

// +30 días por defecto
function venceDefault() {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toISOString().slice(0, 10)
}

export function NuevaFacturaForm() {
  const router = useRouter()
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState<ClienteBusqueda[]>([])
  const [cliente, setCliente] = useState<ClienteBusqueda | null>(null)
  const [pedidos, setPedidos] = useState<PedidoFacturable[]>([])
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [vence, setVence] = useState(venceDefault())
  const [abono, setAbono] = useState('')
  const [metodo, setMetodo] = useState<MetodoPago>('efectivo')
  const [notas, setNotas] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [pending, start] = useTransition()

  // Buscar clientes (debounce simple)
  useEffect(() => {
    if (cliente) return
    const t = setTimeout(async () => {
      if (busqueda.trim().length < 2) { setResultados([]); return }
      setResultados(await buscarClientesAction(busqueda))
    }, 250)
    return () => clearTimeout(t)
  }, [busqueda, cliente])

  async function elegirCliente(c: ClienteBusqueda) {
    setCliente(c)
    setResultados([])
    setBusqueda(c.nombre)
    setCargando(true)
    const ped = await getPedidosFacturablesAction(c.id)
    setPedidos(ped)
    setSeleccionados(new Set())
    setCargando(false)
  }

  function reset() {
    setCliente(null)
    setPedidos([])
    setSeleccionados(new Set())
    setBusqueda('')
  }

  function toggle(id: string, sedeId: string) {
    const next = new Set(seleccionados)
    if (next.has(id)) {
      next.delete(id)
    } else {
      // Solo permitir pedidos de una misma sede
      const sedeSel = pedidos.find(p => seleccionados.has(p.id))?.sede_id
      if (sedeSel && sedeSel !== sedeId) {
        setError('Solo puedes agrupar pedidos de la misma sede en una factura')
        return
      }
      next.add(id)
    }
    setError('')
    setSeleccionados(next)
  }

  const elegidos = pedidos.filter(p => seleccionados.has(p.id))
  const totalNeto = elegidos.reduce((s, p) => s + p.saldo, 0)

  function crear() {
    if (!cliente) return
    if (elegidos.length === 0) { setError('Selecciona al menos un pedido'); return }
    const ab = abono ? parseInt(abono.replace(/\D/g, ''), 10) : 0
    if (ab > totalNeto) { setError('El abono no puede superar el total neto'); return }
    setError('')
    start(async () => {
      const r = await crearFacturaAction({
        cliente_id: cliente.id,
        pedido_ids: elegidos.map(p => p.id),
        fecha_vencimiento: vence,
        notas,
        abono_inicial: ab,
        metodo_abono: metodo,
      })
      if (!r.ok) { setError(r.error); return }
      router.push(`/facturacion/${r.facturaId}`)
    })
  }

  return (
    <div className="space-y-5">
      {/* Cliente */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <label className="block text-sm font-semibold text-gray-900 mb-2">Cliente</label>
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
            <input
              type="text"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o teléfono…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {resultados.length > 0 && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                {resultados.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => elegirCliente(c)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b border-gray-50 last:border-0"
                  >
                    <span className="font-medium text-gray-900">{c.nombre}</span>
                    <span className="text-gray-400 ml-2">{c.telefono_normalizado}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pedidos facturables */}
      {cliente && (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-sm font-semibold text-gray-900 mb-3">Pedidos entregados sin facturar</p>
          {cargando ? (
            <p className="text-sm text-gray-400">Cargando…</p>
          ) : pedidos.length === 0 ? (
            <p className="text-sm text-gray-400">Este cliente no tiene pedidos entregados pendientes de facturar.</p>
          ) : (
            <div className="space-y-2">
              {pedidos.map(p => (
                <label
                  key={p.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    seleccionados.has(p.id) ? 'border-blue-300 bg-blue-50' : 'border-gray-100 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={seleccionados.has(p.id)}
                    onChange={() => toggle(p.id, p.sede_id)}
                    className="w-4 h-4 accent-blue-600"
                  />
                  <div className="flex-1">
                    <p className="font-mono text-sm text-gray-900">{p.numero_orden} <span className="text-xs text-gray-400">· {p.sede_codigo}</span></p>
                    <p className="text-xs text-gray-400">{formatFecha(p.fecha_creacion)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">{formatCOP(p.saldo)}</p>
                    {p.abonado > 0 && <p className="text-xs text-gray-400">abonado {formatCOP(p.abonado)}</p>}
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Configuración de factura */}
      {cliente && elegidos.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <span className="text-sm text-gray-500">Total a facturar (neto)</span>
            <span className="text-lg font-bold text-gray-900">{formatCOP(totalNeto)}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Fecha de vencimiento</label>
              <input
                type="date"
                value={vence}
                onChange={e => setVence(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Abono inicial (opcional)</label>
              <input
                type="text"
                inputMode="numeric"
                value={abono}
                onChange={e => setAbono(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {abono && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Método del abono</label>
                <select
                  value={metodo}
                  onChange={e => setMetodo(e.target.value as MetodoPago)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {METODOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">Notas (opcional)</label>
              <input
                type="text"
                value={notas}
                onChange={e => setNotas(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {cliente && (
        <Button onClick={crear} disabled={pending || elegidos.length === 0} className="w-full">
          {pending ? 'Creando factura…' : `Crear factura · ${formatCOP(totalNeto)}`}
        </Button>
      )}
    </div>
  )
}
