import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PerfilForm } from '@/components/perfil/PerfilForm'

export default async function PerfilPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('nombre, rol, sede_id, sedes(nombre)')
    .eq('id', user.id)
    .single()

  if (!usuario) redirect('/login')

  return (
    <div className="p-6 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Mi perfil</h1>
      <PerfilForm
        nombre={usuario.nombre}
        email={user.email ?? ''}
        rol={usuario.rol}
        sede={(usuario.sedes as any)?.nombre ?? null}
      />
    </div>
  )
}
