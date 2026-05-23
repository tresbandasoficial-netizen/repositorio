import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getClientes } from '@/lib/queries/clientes'
import { formatFecha } from '@/lib/utils/format'
import { formatearTelefono } from '@/lib/utils/phone'
import { ClientesBusqueda } from '@/components/clientes/ClientesBusqueda'

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { q } = await searchParams
  const clientes = await getClientes(q)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Clientes</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {clientes.length} {clientes.length === 1 ? 'cliente' : 'clientes'}
            {q && ` para "${q}"`}
          </p>
        </div>
      </div>

      <div className="mb-4">
        <ClientesBusqueda valorInicial={q ?? ''} />
      </div>

      {clientes.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          {q ? `Sin resultados para "${q}"` : 'No hay clientes registrados'}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Cliente</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Teléfono</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Pedidos</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Último pedido</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {clientes.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-900">{c.nombre}</p>
                    {c.cedula && (
                      <p className="text-xs text-gray-400 mt-0.5">CC {c.cedula}</p>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {formatearTelefono(c.telefono_normalizado)}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-gray-700 text-xs font-semibold">
                      {c.total_pedidos}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {c.ultimo_pedido ? formatFecha(c.ultimo_pedido) : '—'}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <Link
                      href={`/clientes/${c.id}`}
                      className="text-sm text-blue-600 hover:underline font-medium"
                    >
                      Ver →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
