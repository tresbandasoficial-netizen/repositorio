import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export type SesionUsuario = {
  id: string
  rol: 'asesor' | 'admin'
  sede_id: string | null
}

// Obtiene la sesión activa; redirige a /login si no hay usuario autenticado.
export async function getSesion(): Promise<SesionUsuario> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('rol, sede_id')
    .eq('id', user.id)
    .single()

  if (!usuario) redirect('/login')

  return { id: user.id, rol: usuario.rol as 'asesor' | 'admin', sede_id: usuario.sede_id }
}

// Devuelve true si el usuario puede operar sobre un pedido de la sede dada.
// Admin: acceso total. Asesor: solo su propia sede.
export function puedeAccederSede(sesion: SesionUsuario, sedePedido: string): boolean {
  if (sesion.rol === 'admin') return true
  return sesion.sede_id === sedePedido
}
