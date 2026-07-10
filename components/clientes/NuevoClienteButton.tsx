'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { crearClienteAction } from '@/app/actions/clientes'

// Crear un cliente directamente desde la página de Clientes, sin pedido/factura.
export function NuevoClienteButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [cedula, setCedula] = useState('')
  const [email, setEmail] = useState('')
  const [notas, setNotas] = useState('')
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  function reset() {
    setNombre(''); setTelefono(''); setCedula(''); setEmail(''); setNotas(''); setError('')
  }

  function crear() {
    setError('')
    if (!nombre.trim()) { setError('El nombre es obligatorio'); return }
    if (!telefono.trim()) { setError('El teléfono es obligatorio'); return }
    start(async () => {
      const r = await crearClienteAction({ nombre, telefono, cedula, email, notas })
      if (!r.ok) { setError(r.error); return }
      setOpen(false)
      router.push(`/clientes/${r.id}`)
    })
  }

  return (
    <>
      <button
        onClick={() => { reset(); setOpen(true) }}
        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700"
      >
        + Nuevo cliente
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Nuevo cliente</h2>
              <p className="text-xs text-gray-500 mt-0.5">Registra un cliente sin necesidad de hacerle un pedido o factura.</p>
            </div>

            <div className="px-6 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Nombre *</label>
                <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} autoFocus
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Teléfono *</label>
                  <input type="text" inputMode="numeric" value={telefono} onChange={e => setTelefono(e.target.value)}
                    placeholder="300 123 4567"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Cédula (opcional)</label>
                  <input type="text" value={cedula} onChange={e => setCedula(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Email (opcional)</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Nota (opcional)</label>
                <input type="text" value={notas} onChange={e => setNotas(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => setOpen(false)}
                className="flex-1 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={crear} disabled={pending}
                className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50">
                {pending ? 'Creando…' : 'Crear cliente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
