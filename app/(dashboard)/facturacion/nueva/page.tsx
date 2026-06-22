import Link from 'next/link'
import { getSesion } from '@/lib/auth/acceso'
import { createClient } from '@/lib/supabase/server'
import { NuevaFacturaForm } from '@/components/facturacion/NuevaFacturaForm'

export default async function NuevaFacturaPage() {
  const sesion = await getSesion()
  const supabase = await createClient()

  let sedes: { id: string; codigo: string; nombre: string }[] = []
  if (sesion.rol === 'admin') {
    const { data } = await supabase.from('sedes').select('id, codigo, nombre').order('codigo')
    sedes = (data ?? []) as typeof sedes
  } else if (sesion.sede_id) {
    const { data } = await supabase.from('sedes').select('id, codigo, nombre').eq('id', sesion.sede_id).single()
    if (data) sedes = [data]
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Link href="/facturacion" className="text-sm text-blue-600 hover:underline">Ver facturas emitidas →</Link>
      <h1 className="text-xl font-bold text-gray-900 mt-3 mb-1">Facturar</h1>
      <p className="text-sm text-gray-500 mb-6">
        Si es un pedido, búscalo por su número. Si no, busca el cliente y agrégale artículos del inventario.
      </p>
      <NuevaFacturaForm sedes={sedes} />
    </div>
  )
}
