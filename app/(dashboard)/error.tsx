'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[dashboard error]', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
      <p className="text-4xl mb-4">⚠</p>
      <h2 className="text-lg font-bold text-gray-900 mb-2">Algo salió mal</h2>
      <p className="text-sm text-gray-500 mb-6 max-w-sm">
        {error.message ?? 'Ocurrió un error inesperado. Por favor intenta de nuevo.'}
      </p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
      >
        Intentar de nuevo
      </button>
    </div>
  )
}
