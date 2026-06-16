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

  const [{ data: pedido }, { data: items }] = await Promise.all([
    supabase
      .from('vista_pedidos_asesor')
      .select('id, numero_orden, estado, notas, tipo_entrega, direccion_entrega, numero_guia, sede_id, sede_codigo, cliente_id, cliente_nombre, cliente_telefono')
      .eq('id', id)
      .single(),
    supabase
      .from('pedido_items')
      .select('id, marca, descripcion, talla, cantidad, precio_venta, imagen_url')
      .eq('pedido_id', id)
      .order('id'),
  ])

  if (!pedido) notFound()
  if (!puedeAccederSede(sesion, pedido.sede_id)) notFound()
  if (pedido.estado === 'cancelado') notFound()

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/pedidos/${id}`} className="text-gray-400 hover:text-gray-600 text-sm">
          ← {pedido.numero_orden}
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-lg font-bold text-gray-900">Editar pedido</h1>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-900">Pedido {pedido.numero_orden}</h2>
        </CardHeader>
        <CardContent>
          <EditarPedidoForm
            pedidoId={pedido.id}
            sedeCodigo={(pedido as any).sede_codigo ?? ''}
            numeroOrden={pedido.numero_orden}
            clienteId={(pedido as any).cliente_id ?? ''}
            clienteNombre={(pedido as any).cliente_nombre ?? ''}
            clienteTelefono={(pedido as any).cliente_telefono ?? ''}
            notas={pedido.notas}
            tipoEntrega={pedido.tipo_entrega as 'sede' | 'domicilio'}
            direccionEntrega={pedido.direccion_entrega}
            numeroGuia={(pedido as any).numero_guia ?? null}
            productos={(items ?? []).map((it: any) => ({
              marca:        it.marca,
              descripcion:  it.descripcion,
              talla:        it.talla ?? '',
              cantidad:     it.cantidad,
              precio_venta: it.precio_venta,
              imagen_url:   it.imagen_url ?? null,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  )
}
