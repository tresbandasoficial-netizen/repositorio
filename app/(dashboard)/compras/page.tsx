import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCOP } from '@/lib/utils/format'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Compra } from '@/types'

export default async function ComprasPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (!usuario || usuario.rol !== 'admin') redirect('/dashboard')

  const { data: compras } = await supabase
    .from('compras')
    .select(`
      id, tipo, proveedor, fecha, total_usd, trm, total_cop, notas, creado_por, creado_en,
      compra_items(id)
    `)
    .order('fecha', { ascending: false })
    .order('creado_en', { ascending: false })

  const filas = (compras ?? []) as (Compra & { compra_items: { id: string }[] })[]

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Compras</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filas.length === 0
              ? 'Sin compras registradas'
              : `${filas.length} factura${filas.length !== 1 ? 's' : ''} de compra`}
          </p>
        </div>
        <Link href="/compras/nueva">
          <Button>+ Nueva compra</Button>
        </Link>
      </div>

      {filas.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          Aún no hay compras registradas
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Fecha</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Proveedor</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Tipo</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Total COP</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Items</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filas.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-gray-700">
                    {new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(c.fecha + 'T12:00:00'))}
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-medium text-gray-900">{c.proveedor}</p>
                    {(c as any).numero_factura && (
                      <p className="text-xs text-gray-400 font-mono mt-0.5">#{(c as any).numero_factura}</p>
                    )}
                    {c.notas && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{c.notas}</p>
                    )}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <Badge className={c.tipo === 'usa' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}>
                      {c.tipo === 'usa' ? 'USA' : 'Colombia'}
                    </Badge>
                  </td>
                  <td className="px-4 py-4 text-right font-medium text-gray-900 hidden md:table-cell">
                    {formatCOP(c.total_cop)}
                  </td>
                  <td className="px-4 py-4 text-center hidden sm:table-cell">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-gray-700 text-xs font-semibold">
                      {c.compra_items.length}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <Link
                      href={`/compras/${c.id}`}
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
      )}
    </div>
  )
}
