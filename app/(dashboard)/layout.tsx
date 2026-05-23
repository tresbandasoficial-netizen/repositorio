import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/Sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('nombre, rol')
    .eq('id', user.id)
    .single()

  if (!usuario) redirect('/login')

  return (
    <div className="flex min-h-screen">
      <Sidebar usuario={usuario} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
