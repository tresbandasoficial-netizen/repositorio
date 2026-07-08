'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cargarSaldoAntiguoAction } from '@/app/actions/cartera'
import { buscarClientesAction, ClienteBusqueda } from '@/app/actions/clientes'
import { formatCOP } from '@/lib/utils/format'

type Sede = { id: string; codigo: string; nombre: string }

// Carga un saldo antiguo (deuda de antes del sistema) para un cliente.
export function CargarSaldoButton({ sedes }: { sedes: Sede[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState<ClienteBusqueda[]>([])
  const [cliente, setCliente] = useState<ClienteBusqueda | null>(null)
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [sedeId, setSedeId] = useState(sedes.find(s => s.codigo === 'TR')?.id ?? sedes[0]?.id ?? '')
  const [valor, setValor] = useState('')
  const [notas, setNotas] = useState('')
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')
  const [pending, start] = useTransition()

  const valorNum = parseInt(valor.replace(/\D/g, ''), 10) || 0

  useEffect(() => {
    if (cliente) return
    const t = setTimeout(async () => {
      if (busqueda.trim().length < 2) { setResultados([]); return }
      setResultados(await buscarClientesAction(busqueda))
    }, 250)
    return () => clearTimeout(t)
  }, [busqueda, cliente])

  function reset() {
    setBusqueda(''); setResultados([]); setCliente(null)
    setNombre(''); setTelefono(''); setValor(''); setNotas('')
    setError(''); setExito('')
  }

  function confirmar() {
    setError('')
    if (!cliente && (!nombre.trim() || !telefono.trim())) {
      setError('Busca un cliente existente o escribe nombre y teléfono del nuevo'); return
    }
    if (valorNum <= 0) { setError('Escribe cuánto debe el cliente'); return }

    start(async () => {
      const r = await cargarSaldoAntiguoAction({
        cliente_id: cliente?.id ?? null,
        cliente_nombre: cliente?.nombre ?? nombre,
        cliente_telefono: cliente?.telefono_normalizado ?? telefono,
        sede_id: sedeId,
        valor: valorNum,
        notas,
      })
      if (!r.ok) { setError(r.error); return }
      setExito(`Deuda de ${formatCOP(valorNum)} cargada (${r.numeroOrden}). Puedes cargar otra.`)
      setBusqueda(''); setCliente(null); setNombre(''); setTelefono(''); setValor(''); setNotas('')
      router.refresh()
    })
  }

  return (
    <>
      <button
        onClick={() => { reset(); setOpen(true) }}
        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700"
      >
        + Cargar saldo antiguo
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Cargar saldo antiguo</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Deuda de pedidos anteriores al sistema. Queda en Cartera y se le registran abonos normalmente.
              </p>
            </div>

            <div className="px-6 py-4 space-y-3">
              {/* Cliente */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Cliente</label>
                {cliente ? (
                  <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{cliente.nombre}</p>
                      <p className="text-xs text-gray-500">{cliente.telefono_normalizado}</p>
                    </div>
                    <button type="button" onClick={() => setCliente(null)} className="text-xs text-blue-600 hover:underline">
                      Cambiar
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <input
                        type="text"
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                        placeholder="Buscar cliente existente…"
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      {resultados.length > 0 && (
                        <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-44 overflow-y-auto">
                          {resultados.map(c => (
                            <button key={c.id} type="button"
                              onClick={() => { setCliente(c); setResultados([]); setBusqueda('') }}
                              className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b border-gray-50 last:border-0">
                              <span className="font-medium text-gray-900">{c.nombre}</span>
                              <span className="text-gray-400 ml-2">{c.telefono_normalizado}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">…o escribe los datos de un cliente nuevo:</p>
                    <div className="grid grid-cols-2 gap-2">
                      <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre"
                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <input type="text" value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="Teléfono"
                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                )}
              </div>

              {/* Sede + Valor */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Sede</label>
                  <select value={sedeId} onChange={e => setSedeId(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Cuánto debe *</label>
                  <input type="text" inputMode="numeric" value={valor}
                    onChange={e => setValor(e.target.value.replace(/\D/g, ''))}
                    placeholder="450000"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  {valorNum > 0 && <p className="text-xs text-gray-400 mt-1">{formatCOP(valorNum)}</p>}
                </div>
              </div>

              {/* Notas */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Nota (opcional)</label>
                <input type="text" value={notas} onChange={e => setNotas(e.target.value)}
                  placeholder="Ej: debe desde mayo, 2 pares de tenis…"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
              {exito && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">✓ {exito}</p>}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => setOpen(false)}
                className="flex-1 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">
                Cerrar
              </button>
              <button onClick={confirmar} disabled={pending}
                className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50">
                {pending ? 'Cargando…' : 'Cargar deuda'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
