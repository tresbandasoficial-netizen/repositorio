import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export type SesionUsuario = {
  id: string
  rol: 'asesor' | 'admin' | 'visor'
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

  return { id: user.id, rol: usuario.rol as 'asesor' | 'admin' | 'visor', sede_id: usuario.sede_id }
}

// Admin y visor (solo lectura) ven todas las sedes. El asesor solo la suya.
export function puedeAccederSede(sesion: SesionUsuario, sedePedido: string): boolean {
  if (sesion.rol === 'admin' || sesion.rol === 'visor') return true
  return sesion.sede_id === sedePedido
}

// El rol 'visor' es de solo lectura: no puede crear, editar ni eliminar.
export function esSoloLectura(sesion: SesionUsuario): boolean {
  return sesion.rol === 'visor'
}
