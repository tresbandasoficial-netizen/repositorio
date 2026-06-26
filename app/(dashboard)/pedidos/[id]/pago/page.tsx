import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { RegistrarPagoForm } from '@/components/pedidos/RegistrarPagoForm'
import { getSesion, puedeAccederSede } from '@/lib/auth/acceso'

export default async function RegistrarPagoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const sesion = await getSesion()
  const supabase = await createClient()
  const { id } = await params

  const { data: pedido } = await supabase
    .from('vista_pedidos_asesor')
    .select('id, numero_orden, estado, total, total_pagado, sede_id, sede_codigo')
    .eq('id', id)
    .single()

  if (!pedido) notFound()
  if (!puedeAccederSede(sesion, pedido.sede_id)) notFound()
  if (pedido.estado === 'cancelado') redirect(`/pedidos/${id}`)

  return (
    <div className="p-6 max-w-xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/pedidos/${id}`} className="text-gray-400 hover:text-gray-600 text-sm">
          ← {pedido.numero_orden}
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-lg font-bold text-gray-900">Registrar pago</h1>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-900">Pedido {pedido.numero_orden}</h2>
        </CardHeader>
        <CardContent>
          <RegistrarPagoForm
            pedidoId={pedido.id}
            total={pedido.total}
            totalPagado={pedido.total_pagado}
            sedeCodigo={(pedido as { sede_codigo?: string }).sede_codigo}
          />
        </CardContent>
      </Card>
    </div>
  )
}
