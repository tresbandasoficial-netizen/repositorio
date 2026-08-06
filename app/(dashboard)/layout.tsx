import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { AvisoTareas } from '@/components/tareas/AvisoTareas'
import { ChatFlotante } from '@/components/chat/ChatFlotante'
import { MensajeMotivacional } from '@/components/retos/MensajeMotivacional'
import { getRetoVigente } from '@/lib/queries/retos'
import { hoyBogota } from '@/lib/utils/format'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id, nombre, rol, sede:sedes(codigo)')
    .eq('id', user.id)
    .single()

  if (!usuario) redirect('/login')

  const sedeCodigo = (Array.isArray(usuario.sede) ? usuario.sede[0] : usuario.sede)?.codigo ?? null

  // Tareas pendientes asignadas a quien está conectado: se muestran como un
  // aviso flotante abajo de la pantalla en todas las páginas.
  const { data: tareasPendientes } = await supabase
    .from('tareas')
    .select('id, titulo, descripcion')
    .eq('asignado_a', usuario.id)
    .eq('estado', 'pendiente')
    .order('creado_en', { ascending: true })

  // Burbuja de chat en todas las páginas (mismo RPC que /chat; el visor no chatea).
  const { data: usuariosChat } = usuario.rol === 'visor'
    ? { data: null }
    : await supabase.rpc('chat_usuarios')

  // Mensaje motivacional del reto para ASESORES (banner delgado por franjas
  // horarias — no es el panel grande del reto, que se quitó a pedido del
  // admin). Solo en retos de ventas y solo si el asesor participa.
  let motivacional: { retoId: string; nombre: string; objetivo: number; valorMes: number; ventaHoy: number; premio: string | null } | null = null
  if (usuario.rol === 'asesor') {
    const retoVigente = await getRetoVigente()
    if (retoVigente && retoVigente.reto.metrica === 'ventas') {
      const mio = retoVigente.avances.find(a => a.usuario_id === usuario.id)
      const valorMes = retoVigente.reto.modo === 'grupal'
        ? (retoVigente.grupo?.valor ?? 0)
        : (mio?.valor ?? 0)
      if (mio || retoVigente.reto.modo === 'grupal') {
        const { data: ventasHoy } = await supabase
          .from('pedidos')
          .select('total')
          .eq('asesor_id', usuario.id)
          .gte('fecha_creacion', `${hoyBogota()}T05:00:00.000Z`)
          .neq('estado', 'cancelado')
          .neq('tipo', 'saldo_anterior')
        motivacional = {
          retoId: retoVigente.reto.id,
          nombre: usuario.nombre.trim().split(/\s+/)[0].replace(/^\p{Ll}/u, (c: string) => c.toUpperCase()),
          objetivo: retoVigente.reto.objetivo,
          valorMes,
          ventaHoy: (ventasHoy ?? []).reduce((s, p) => s + (p.total ?? 0), 0),
          premio: retoVigente.reto.premio,
        }
      }
    }
  }

  return (
    <DashboardShell usuario={usuario} sedeCodigo={sedeCodigo}>
      {children}
      <AvisoTareas tareas={tareasPendientes ?? []} />
      {/* El aviso flotante del reto se quitó a pedido de Johan/Ronaldo (1-ago-2026):
          los retos solo se ven entrando a /retos. El banner motivacional por
          franjas (6-ago-2026) es aparte: una línea, cerrable. */}
      {motivacional && <MensajeMotivacional {...motivacional} />}
      {usuario.rol !== 'visor' && (
        <ChatFlotante
          miId={usuario.id}
          usuarios={(usuariosChat ?? []) as Array<{ id: string; nombre: string; rol: string }>}
        />
      )}
    </DashboardShell>
  )
}
