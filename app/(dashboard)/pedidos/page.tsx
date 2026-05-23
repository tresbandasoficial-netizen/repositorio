import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPedidos } from '@/lib/queries/pedidos'
import { PedidosList } from '@/components/pedidos/PedidosList'
import { EstadoPedido } from '@/types'

interface SearchParams {
  estado?: string
  sede?: string
  q?: string
  alerta?: string
  pagina?: string
}

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('nombre, rol, sede_id, sedes(codigo)')
    .eq('id', user.id)
    .single()

  if (!usuario) redirect('/login')

  const esAdmin = usuario.rol === 'admin'
  const params = await searchParams

  const resultado = await getPedidos({
    estado:    params.estado as EstadoPedido | undefined,
    q:         params.q,
    alerta:    params.alerta === '1',
    pagina:    params.pagina ? parseInt(params.pagina) : 1,
    sede:      params.sede,
    // Asesores solo ven pedidos de su sede asignada
    ...(!esAdmin && usuario.sedes ? { sede: (usuario.sedes as any).codigo } : {}),
  })

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pedidos</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gestiona y rastrea todos los pedidos</p>
        </div>
        <Link
          href="/pedidos/nuevo"
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + Nuevo pedido
        </Link>
      </div>

      <PedidosList resultado={resultado} esAdmin={esAdmin} />
    </div>
  )
}
