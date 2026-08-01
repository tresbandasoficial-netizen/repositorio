import { redirect } from 'next/navigation'
import { BotonVolver } from '@/components/ui/BotonVolver'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSiguienteNumeroOrden } from '@/lib/queries/pedidos'
import { CrearPedidoForm } from '@/components/pedidos/CrearPedidoForm'

export default async function NuevoPedidoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase.from('usuarios').select('nombre, rol, sede_id, sedes(codigo)').eq('id', user.id).single()

  if (!usuario) redirect('/login')

  const sedeCodigo = (usuario.sedes as any)?.codigo ?? 'TR'
  const numeroSugerido = await getSiguienteNumeroOrden(sedeCodigo)

  // Asesores activos de la sede: la venta se puede registrar a nombre de
  // cualquiera de ellos. RLS solo deja leer el propio usuario → cliente admin.
  const admin = createAdminClient()
  let sedeIdLista = usuario.sede_id
  if (!sedeIdLista) {
    const { data: sedeFila } = await admin.from('sedes').select('id').eq('codigo', sedeCodigo).single()
    sedeIdLista = sedeFila?.id ?? null
  }
  const { data: asesoresSede } = await admin
    .from('usuarios')
    .select('id, nombre')
    .eq('activo', true)
    .eq('rol', 'asesor')
    .eq('sede_id', sedeIdLista)
    .order('nombre')
  const asesores: { id: string; nombre: string }[] = asesoresSede ?? []
  if (!asesores.some(a => a.id === user.id)) {
    asesores.unshift({ id: user.id, nombre: (usuario as any).nombre ?? 'Yo' })
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <BotonVolver href="/pedidos">Pedidos</BotonVolver>
        <span className="text-gray-300">/</span>
        <h1 className="text-lg font-bold text-gray-900">Nuevo pedido</h1>
      </div>

      <CrearPedidoForm
        numeroSugerido={numeroSugerido}
        asesorNombre={(usuario as any).nombre ?? ''}
        sedeId={usuario.sede_id ?? null}
        esAsesor={(usuario as any).rol === 'asesor'}
        asesores={asesores}
        asesorIdActual={user.id}
      />
    </div>
  )
}
