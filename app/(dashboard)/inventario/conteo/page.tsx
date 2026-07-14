import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'
import { ConteoTabs } from '@/components/inventario/ConteoTabs'

// Conteo físico de inventario: admin cuenta cualquier sede; el asesor, la suya.
export default async function ConteoInventarioPage() {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') redirect('/pedidos')

  const supabase = await createClient()
  const { data: sedesRaw } = await supabase.from('sedes').select('id, codigo, nombre').order('codigo')
  const sedes = (sedesRaw ?? []) as { id: string; codigo: string; nombre: string }[]

  const sedeFijaId = sesion.rol === 'asesor' ? sesion.sede_id : null

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        {sesion.rol === 'admin' && (
          <>
            <Link href="/inventario" className="text-gray-400 hover:text-gray-600 text-sm">← Inventario</Link>
            <span className="text-gray-300">/</span>
          </>
        )}
        <h1 className="text-lg font-bold text-gray-900">Cargar inventario</h1>
      </div>

      <ConteoTabs sedes={sedes} sedeFijaId={sedeFijaId} />
    </div>
  )
}
