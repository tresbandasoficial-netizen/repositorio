import { getSesion } from '@/lib/auth/acceso'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getStockPorSede } from '@/lib/queries/inventario'
import { InventarioPanel } from '@/components/inventario/InventarioPanel'
import { Articulo } from '@/types'

export default async function InventarioPage() {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') redirect('/dashboard')

  const supabase = await createClient()
  const [{ filas, sedes: columnasSedes }, sedesRes, articulosRes] = await Promise.all([
    getStockPorSede(),
    supabase.from('sedes').select('id, codigo, nombre').order('codigo'),
    supabase.from('articulos').select('*').eq('activo', true).order('marca').order('nombre'),
  ])

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Inventario</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Stock por sede. Bucaramanga (TR) es el centro de distribución: las compras sin pedido
          entran allí y desde ahí se transfiere a Cúcuta o Santa Rosa.
        </p>
      </div>

      <InventarioPanel
        filas={filas}
        columnasSedes={columnasSedes}
        sedes={(sedesRes.data ?? []) as { id: string; codigo: string; nombre: string }[]}
        articulos={(articulosRes.data ?? []) as Articulo[]}
      />
    </div>
  )
}
