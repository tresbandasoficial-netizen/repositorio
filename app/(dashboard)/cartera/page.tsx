import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getCartera, getTotalCartera } from '@/lib/queries/cartera'
import { formatCOP } from '@/lib/utils/format'
import { formatearTelefono } from '@/lib/utils/phone'
import { ClientesBusqueda } from '@/components/clientes/ClientesBusqueda'

export default async function CarteraPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; pagina?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (!usuario || usuario.rol !== 'admin') redirect('/dashboard')

  const { q, pagina: paginaParam } = await searchParams
  const pagina = Math.max(1, parseInt(paginaParam ?? '1', 10) || 1)
  const [resultado, carteraTotal] = await Promise.all([
    getCartera({ busqueda: q, pagina }),
    getTotalCartera(),
  ])
  const { clientes, total, totalPaginas } = resultado
  const totalSaldo = (pagina === 1 && !q) ? carteraTotal.saldo : resultado.totalSaldo

  const desde = total === 0 ? 0 : (pagina - 1) * 30 + 1
  const hasta = Math.min(pagina * 30, total)

  function buildUrl(p: number) {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (p > 1) params.set('pagina', p.toString())
    const qs = params.toString()
    return `/cartera${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Cartera</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {total === 0
              ? 'Sin saldos pendientes'
              : `${desde}–${hasta} de ${total} cliente${total !== 1 ? 's' : ''} con saldo`}
            {q && ` para "${q}"`}
          </p>
        </div>
      </div>

      {/* Resumen */}
      {total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">
              Clientes con saldo
            </p>
            <p className="text-2xl font-bold text-gray-900">{total}</p>
          </div>
          <div className="bg-white rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-xs text-red-500 font-medium uppercase tracking-wide mb-1">
              {pagina > 1 || q ? 'Saldo (filtrado)' : 'Cartera total'}
            </p>
            <p className="text-2xl font-bold text-red-700">{formatCOP(totalSaldo)}</p>
          </div>
        </div>
      )}

      <div className="mb-4">
        <ClientesBusqueda valorInicial={q ?? ''} />
      </div>

      {clientes.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          {q ? `Sin resultados para "${q}"` : 'Todos los clientes están al día'}
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Cliente</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Teléfono</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Pedidos</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Total comprado</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Total pagado</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Saldo</th>
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
                    <td className="px-4 py-4 text-gray-600 hidden sm:table-cell">
                      {formatearTelefono(c.telefono_normalizado)}
                    </td>
                    <td className="px-4 py-4 text-center hidden md:table-cell">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-gray-700 text-xs font-semibold">
                        {c.pedidos_activos}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right text-gray-600 hidden md:table-cell">
                      {formatCOP(c.total_comprado)}
                    </td>
                    <td className="px-4 py-4 text-right text-green-700 hidden md:table-cell">
                      {formatCOP(c.total_pagado)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="font-bold text-red-600">{formatCOP(c.saldo)}</span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <Link
                        href={`/clientes/${c.id}`}
                        className="inline-block px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        Ver
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPaginas > 1 && (
            <div className="flex items-center justify-between pt-4">
              <Link
                href={buildUrl(pagina - 1)}
                aria-disabled={pagina === 1}
                className={`px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50 transition-colors ${
                  pagina === 1 ? 'opacity-40 pointer-events-none' : ''
                }`}
              >
                ← Anterior
              </Link>
              <span className="text-sm text-gray-500">
                Página {pagina} de {totalPaginas}
              </span>
              <Link
                href={buildUrl(pagina + 1)}
                aria-disabled={pagina >= totalPaginas}
                className={`px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50 transition-colors ${
                  pagina >= totalPaginas ? 'opacity-40 pointer-events-none' : ''
                }`}
              >
                Siguiente →
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  )
}
