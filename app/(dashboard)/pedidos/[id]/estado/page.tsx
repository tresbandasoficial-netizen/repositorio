import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { CambiarEstadoForm } from '@/components/pedidos/CambiarEstadoForm'
import { EstadoPedido } from '@/types'

export default async function CambiarEstadoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: usuario }, { id }] = await Promise.all([
    supabase.from('usuarios').select('rol').eq('id', user.id).single(),
    params,
  ])

  if (!usuario) redirect('/login')

  const { data: pedido } = await supabase
    .from('pedidos')
    .select('id, numero_orden, estado')
    .eq('id', id)
    .single()

  if (!pedido) notFound()

  return (
    <div className="p-6 max-w-xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/pedidos/${id}`} className="text-gray-400 hover:text-gray-600 text-sm">
          ← {pedido.numero_orden}
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-lg font-bold text-gray-900">Cambiar estado</h1>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-900">Pedido {pedido.numero_orden}</h2>
        </CardHeader>
        <CardContent>
          <CambiarEstadoForm
            pedidoId={pedido.id}
            estadoActual={pedido.estado as EstadoPedido}
            rol={usuario.rol as 'asesor' | 'admin'}
          />
        </CardContent>
      </Card>
    </div>
  )
}
