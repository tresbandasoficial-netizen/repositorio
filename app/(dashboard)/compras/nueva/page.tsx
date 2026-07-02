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

  const { data: cuentasRaw } = await supabase
    .from('cuentas')
    .select('id, nombre, tipo, sede_id')
    .eq('activa', true)
    .neq('tipo', 'credito')
    .order('orden')

  const cuentas = (cuentasRaw ?? []) as Array<{ id: string; nombre: string; tipo: string; sede_id: string | null }>

  // Proveedores ya usados (para autocompletar). Se derivan de las compras
  // existentes — quedan "guardados" sin necesidad de una tabla aparte.
  const { data: provRaw } = await supabase
    .from('compras')
    .select('proveedor')
    .not('proveedor', 'is', null)
    .limit(5000)
  const proveedores = Array.from(
    new Set((provRaw ?? []).map((c: { proveedor: string }) => c.proveedor?.trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b))

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Nueva compra</h1>
        <p className="text-sm text-gray-500 mt-0.5">Registra una factura de compra a proveedor</p>
      </div>
      <CrearCompraForm cuentas={cuentas} proveedores={proveedores} />
    </div>
  )
}
