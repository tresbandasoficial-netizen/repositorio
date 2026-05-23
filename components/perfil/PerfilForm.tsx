'use client'

import { useState, useTransition } from 'react'
import { actualizarNombreAction, cambiarPasswordAction } from '@/app/actions/perfil'

interface Props {
  nombre: string
  email: string
  rol: string
  sede: string | null
}

export function PerfilForm({ nombre, email, rol, sede }: Props) {
  const [nombreVal, setNombreVal]   = useState(nombre)
  const [nombreMsg, setNombreMsg]   = useState<{ ok: boolean; text: string } | null>(null)
  const [isPendingN, startN]        = useTransition()

  const [actual, setActual]         = useState('')
  const [nuevo, setNuevo]           = useState('')
  const [confirmar, setConfirmar]   = useState('')
  const [passMsg, setPassMsg]       = useState<{ ok: boolean; text: string } | null>(null)
  const [isPendingP, startP]        = useTransition()

  function handleNombre(e: React.FormEvent) {
    e.preventDefault()
    setNombreMsg(null)
    startN(async () => {
      const r = await actualizarNombreAction(nombreVal)
      setNombreMsg(r.ok ? { ok: true, text: 'Nombre actualizado' } : { ok: false, text: r.error })
    })
  }

  function handlePassword(e: React.FormEvent) {
    e.preventDefault()
    setPassMsg(null)
    startP(async () => {
      const r = await cambiarPasswordAction(actual, nuevo, confirmar)
      if (r.ok) {
        setActual(''); setNuevo(''); setConfirmar('')
        setPassMsg({ ok: true, text: 'Contraseña actualizada correctamente' })
      } else {
        setPassMsg({ ok: false, text: r.error })
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Información básica */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Información de la cuenta</h2>
        <div className="space-y-3 text-sm mb-5">
          <div className="flex justify-between">
            <span className="text-gray-500">Email</span>
            <span className="text-gray-800">{email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Rol</span>
            <span className="capitalize text-gray-800">{rol}</span>
          </div>
          {sede && (
            <div className="flex justify-between">
              <span className="text-gray-500">Sede</span>
              <span className="text-gray-800">{sede}</span>
            </div>
          )}
        </div>

        <form onSubmit={handleNombre} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Nombre</label>
            <input
              type="text"
              value={nombreVal}
              onChange={(e) => setNombreVal(e.target.value)}
              required
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {nombreMsg && (
            <p className={`text-sm rounded-lg px-4 py-2 ${nombreMsg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
              {nombreMsg.text}
            </p>
          )}
          <button
            type="submit"
            disabled={isPendingN}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {isPendingN ? 'Guardando…' : 'Actualizar nombre'}
          </button>
        </form>
      </div>

      {/* Cambiar contraseña */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Cambiar contraseña</h2>
        <form onSubmit={handlePassword} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Contraseña actual</label>
            <input
              type="password"
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Nueva contraseña</label>
            <input
              type="password"
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Mínimo 8 caracteres"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirmar contraseña</label>
            <input
              type="password"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {passMsg && (
            <p className={`text-sm rounded-lg px-4 py-2 ${passMsg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
              {passMsg.text}
            </p>
          )}
          <button
            type="submit"
            disabled={isPendingP}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-900 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {isPendingP ? 'Cambiando…' : 'Cambiar contraseña'}
          </button>
        </form>
      </div>
    </div>
  )
}
