import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { formatCOP } from '@/lib/utils/format'
import { ItemAsignacion } from '@/components/compras/ItemAsignacion'
import { Compra, CompraItem } from '@/types'

type CompraConItems = Compra & {
  compra_items: (CompraItem & { pedido: { numero_orden: string } | null })[]
}

export default async function CompraDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
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

  const { id } = await params

  const { data } = await supabase
    .from('compras')
    .select(`
      id, tipo, proveedor, fecha, total_usd, trm, total_cop, notas, creado_por, creado_en,
      compra_items (
        id, compra_id, descripcion, marca, talla, cantidad, costo_unitario_cop,
        destino, pedido_id, transferido_contoda, transferido_en, creado_en,
        pedido:pedidos (numero_orden)
      )
    `)
    .eq('id', id)
    .single()

  if (!data) notFound()

  const compra = data as unknown as CompraConItems

  const itemsSinAsignar = compra.compra_items.filter((i) => i.destino === 'sin_asignar')
  const itemsAsignados = compra.compra_items.filter((i) => i.destino !== 'sin_asignar')

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/compras" className="text-gray-400 hover:text-gray-600 text-sm">
          ← Compras
        </Link>
        <span className="text-gray-300">/</span>
        <span className="font-semibold text-gray-900">{compra.proveedor}</span>
        <Badge className={compra.tipo === 'usa' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}>
          {compra.tipo === 'usa' ? 'USA' : 'Colombia'}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">Fecha</p>
            <p className="text-lg font-semibold text-gray-900">
              {new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
                new Date(compra.fecha + 'T12:00:00')
              )}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">Total COP</p>
            <p className="text-lg font-semibold text-gray-900">{formatCOP(compra.total_cop)}</p>
            {compra.tipo === 'usa' && compra.total_usd && compra.trm && (
              <p className="text-xs text-gray-400 mt-0.5">
                USD {compra.total_usd.toLocaleString('es-CO')} × TRM {compra.trm.toLocaleString('es-CO')}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">Items</p>
            <p className="text-lg font-semibold text-gray-900">{compra.compra_items.length}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {itemsSinAsignar.length} sin asignar
            </p>
          </CardContent>
        </Card>
      </div>

      {compra.notas && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-800 mb-6">
          <span className="font-medium">Notas: </span>{compra.notas}
        </div>
      )}

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-900">
            Productos ({compra.compra_items.length})
          </h2>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Descripción</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Talla</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Cant.</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Costo unit.</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Destino</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {compra.compra_items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    {item.marca && (
                      <span className="font-medium text-gray-900">{item.marca} </span>
                    )}
                    <span className="text-gray-700">{item.descripcion}</span>
                  </td>
                  <td className="px-4 py-4 text-center text-gray-500 hidden sm:table-cell">
                    {item.talla ?? '—'}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-gray-700 text-xs font-semibold">
                      {item.cantidad}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right text-gray-600 hidden md:table-cell">
                    {formatCOP(item.costo_unitario_cop)}
                  </td>
                  <td className="px-4 py-4">
                    <ItemAsignacion
                      itemId={item.id}
                      destino={item.destino}
                      pedidoNumeroOrden={item.pedido?.numero_orden ?? null}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {itemsSinAsignar.length > 0 && (
        <p className="text-xs text-gray-400 mt-3 text-right">
          {itemsSinAsignar.length} de {compra.compra_items.length} items sin asignar
        </p>
      )}
      {itemsAsignados.length === compra.compra_items.length && compra.compra_items.length > 0 && (
        <p className="text-xs text-green-600 mt-3 text-right font-medium">
          Todos los items asignados
        </p>
      )}
    </div>
  )
}
