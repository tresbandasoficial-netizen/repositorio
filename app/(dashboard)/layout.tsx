import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardShell } from '@/components/layout/DashboardShell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id, nombre, rol')
    .eq('id', user.id)
    .single()

  if (!usuario) redirect('/login')

  return (
    <DashboardShell usuario={usuario}>
      {children}
    </DashboardShell>
  )
}
