'use client'

import { useState, useTransition } from 'react'
import { invitarUsuarioAction } from '@/app/actions/usuarios'
import { Sede } from '@/types'

interface Props {
  sedes: Pick<Sede, 'id' | 'nombre' | 'codigo'>[]
}

export function InvitarUsuarioForm({ sedes }: Props) {
  const [nombre, setNombre] = useState('')
  const [email, setEmail]   = useState('')
  const [rol, setRol]       = useState<'asesor' | 'admin'>('asesor')
  const [sedeId, setSedeId] = useState('')
  const [error, setError]   = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (rol === 'asesor' && !sedeId) {
      setError('Un asesor debe tener una sede asignada.')
      return
    }

    startTransition(async () => {
      const result = await invitarUsuarioAction({
        nombre,
        email,
        rol,
        sede_id: sedeId || null,
      })
      if (!result.ok) setError(result.error)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Nombre completo <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Ana García"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="ana@ejemplo.com"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Rol</label>
          <div className="flex gap-2">
            {(['asesor', 'admin'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRol(r)}
                className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors capitalize ${
                  rol === r
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-gray-300 text-gray-700 hover:border-blue-400'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Sede {rol === 'asesor' && <span className="text-red-500">*</span>}
          </label>
          <select
            value={sedeId}
            onChange={(e) => setSedeId(e.target.value)}
            required={rol === 'asesor'}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">Sin sede asignada</option>
            {sedes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre} ({s.codigo})
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>
      )}

      <div className="pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {isPending ? 'Enviando invitación...' : 'Invitar usuario'}
        </button>
        <p className="mt-2 text-xs text-gray-400">
          Se enviará un email con un enlace para establecer la contraseña.
        </p>
      </div>
    </form>
  )
}
