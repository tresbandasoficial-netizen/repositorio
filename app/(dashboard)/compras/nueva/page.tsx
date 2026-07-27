import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CrearCompraForm } from '@/components/compras/CrearCompraForm'

export default async function NuevaCompraPage({
  searchParams,
}: {
  searchParams: Promise<{ pedidos?: string }>
}) {
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

  // Proveedores ya usados (para el buscador). Se derivan de las compras
  // existentes — quedan "guardados" sin necesidad de una tabla aparte.
  //
  // Se agrupan SIN distinguir mayúsculas ni espacios y de cada grupo se conserva
  // la escritura más usada: antes "Alo" y "alo" salían como dos proveedores
  // distintos en la lista.
  const { data: provRaw } = await supabase
    .from('compras')
    .select('proveedor')
    .not('proveedor', 'is', null)
    .limit(5000)

  const conteo = new Map<string, Map<string, number>>()
  for (const c of (provRaw ?? []) as Array<{ proveedor: string }>) {
    const escrito = c.proveedor?.trim()
    if (!escrito) continue
    const clave = escrito.toLowerCase()
    const grupo = conteo.get(clave) ?? new Map<string, number>()
    grupo.set(escrito, (grupo.get(escrito) ?? 0) + 1)
    conteo.set(clave, grupo)
  }
  const proveedores = [...conteo.values()]
    .map(grupo => [...grupo.entries()].sort((a, b) => b[1] - a[1])[0][0])
    .sort((a, b) => a.localeCompare(b, 'es'))

  // Pedidos seleccionados en la galería (?pedidos=TR6821,TR6822)
  const { pedidos: pedidosParam } = await searchParams
  const pedidosIniciales = (pedidosParam ?? '')
    .split(',')
    .map(p => p.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 40)

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Nueva compra</h1>
        <p className="text-sm text-gray-500 mt-0.5">Registra una factura de compra a proveedor</p>
      </div>
      <CrearCompraForm cuentas={cuentas} proveedores={proveedores} pedidosIniciales={pedidosIniciales} />
    </div>
  )
}
