import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPedidos } from '@/lib/queries/pedidos'
import { PedidosList } from '@/components/pedidos/PedidosList'
import { EstadoPedido } from '@/types'
import { Plus } from 'lucide-react'

interface SearchParams {
  estado?: string
  sede?: string
  q?: string
  alerta?: string
  pagina?: string
  desde?: string
  hasta?: string
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
    estado:       params.estado as EstadoPedido | undefined,
    q:            params.q,
    alerta:       params.alerta === '1',
    pagina:       params.pagina ? parseInt(params.pagina) : 1,
    sede:         params.sede,
    fecha_desde:  params.desde,
    fecha_hasta:  params.hasta,
    ...(!esAdmin && usuario.sedes ? { sede: (usuario.sedes as any).codigo } : {}),
  })

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pedidos</h1>
          <p className="text-sm text-gray-400 mt-0.5">Gestiona y rastrea todos los pedidos</p>
        </div>
        <Link
          href="/pedidos/nuevo"
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-4 py-2.5 rounded-2xl transition-colors shadow-md shadow-blue-200"
        >
          <Plus size={15} />
          Nuevo pedido
        </Link>
      </div>

      <PedidosList resultado={resultado} esAdmin={esAdmin} />
    </div>
  )
}
