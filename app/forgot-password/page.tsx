'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [email,    setEmail]    = useState('')
  const [enviado,  setEnviado]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [isPending, start]      = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    start(async () => {
      const supabase = createClient()
      const redirectTo = `${window.location.origin}/auth/callback?type=recovery`
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
      if (error) {
        setError('Ocurrió un error. Intenta de nuevo.')
      } else {
        setEnviado(true)
      }
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">TR Original</h1>
          <p className="mt-1 text-sm text-gray-500">Plataforma de pedidos</p>
        </div>

        <div className="bg-white shadow rounded-xl p-8">
          {enviado ? (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <span className="text-2xl">✉</span>
              </div>
              <h2 className="text-base font-semibold text-gray-900">Revisa tu correo</h2>
              <p className="text-sm text-gray-500">
                Si existe una cuenta con <strong>{email}</strong>, recibirás un enlace para
                restablecer tu contraseña en los próximos minutos.
              </p>
              <Link
                href="/login"
                className="block text-sm text-blue-600 hover:underline mt-4"
              >
                Volver al inicio de sesión
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-1">Recuperar contraseña</h2>
                <p className="text-sm text-gray-500">
                  Ingresa tu correo y te enviaremos un enlace para crear una nueva contraseña.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Correo electrónico
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="correo@ejemplo.com"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
              )}

              <button
                type="submit"
                disabled={isPending}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium text-sm py-2.5 rounded-lg transition-colors"
              >
                {isPending ? 'Enviando...' : 'Enviar enlace'}
              </button>

              <div className="text-center">
                <Link href="/login" className="text-sm text-gray-500 hover:text-gray-700">
                  Volver al inicio de sesión
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
