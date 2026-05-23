import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { EditarPedidoForm } from '@/components/pedidos/EditarPedidoForm'
import { getSesion, puedeAccederSede } from '@/lib/auth/acceso'

export default async function EditarPedidoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const sesion = await getSesion()
  const supabase = await createClient()
  const { id } = await params

  const { data: pedido } = await supabase
    .from('vista_pedidos_asesor')
    .select('id, numero_orden, estado, notas, tipo_entrega, direccion_entrega, numero_guia, sede_id')
    .eq('id', id)
    .single()

  if (!pedido) notFound()
  if (!puedeAccederSede(sesion, pedido.sede_id)) notFound()
  if (pedido.estado === 'cancelado') notFound()

  return (
    <div className="p-6 max-w-xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/pedidos/${id}`} className="text-gray-400 hover:text-gray-600 text-sm">
          ← {pedido.numero_orden}
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-lg font-bold text-gray-900">Editar pedido</h1>
      </div>

      <Card>
        <CardHeader>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Pedido {pedido.numero_orden}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Solo se pueden editar las notas y los datos de entrega. Los productos y el total son inmutables.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <EditarPedidoForm
            pedidoId={pedido.id}
            notas={pedido.notas}
            tipoEntrega={pedido.tipo_entrega as 'sede' | 'domicilio'}
            direccionEntrega={pedido.direccion_entrega}
            numeroGuia={(pedido as any).numero_guia ?? null}
          />
        </CardContent>
      </Card>
    </div>
  )
}
