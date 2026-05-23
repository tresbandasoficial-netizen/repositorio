import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6 text-center">
      <p className="text-6xl font-bold text-gray-200 mb-4">404</p>
      <h2 className="text-lg font-bold text-gray-900 mb-2">Página no encontrada</h2>
      <p className="text-sm text-gray-500 mb-6">
        Esta página no existe o no tienes acceso a ella.
      </p>
      <Link
        href="/dashboard"
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
      >
        Volver al dashboard
      </Link>
    </div>
  )
}
