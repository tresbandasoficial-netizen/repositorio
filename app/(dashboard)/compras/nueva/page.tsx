import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CrearCompraForm } from '@/components/compras/CrearCompraForm'

export default async function NuevaCompraPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (!usuario || usuario.rol !== 'admin') redirect('/dashboard')

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Nueva compra</h1>
        <p className="text-sm text-gray-500 mt-0.5">Registra una factura de compra a proveedor</p>
      </div>
      <CrearCompraForm />
    </div>
  )
}
