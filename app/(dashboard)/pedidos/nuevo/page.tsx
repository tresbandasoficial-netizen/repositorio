import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSiguienteNumeroOrden } from '@/lib/queries/pedidos'
import { CrearPedidoForm } from '@/components/pedidos/CrearPedidoForm'

export default async function NuevoPedidoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('nombre, sede_id, sedes(codigo)')
    .eq('id', user.id)
    .single()

  if (!usuario) redirect('/login')

  const sedeCodigo = (usuario.sedes as any)?.codigo ?? 'TR'
  const numeroSugerido = await getSiguienteNumeroOrden(sedeCodigo)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/pedidos" className="text-gray-400 hover:text-gray-600 text-sm">
          ← Pedidos
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-lg font-bold text-gray-900">Nuevo pedido</h1>
      </div>

      <CrearPedidoForm numeroSugerido={numeroSugerido} />
    </div>
  )
}
