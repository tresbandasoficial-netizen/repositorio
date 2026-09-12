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

  // El catálogo ya pasa de 1000 artículos y PostgREST corta en 1000 EN
  // SILENCIO: un select('*') simple dejaba ~600 fichas por fuera (no salían
  // en el buscador ni en los selectores de entrada/transferencia, y parecía
  // que los artículos creados desde pedidos "no se guardaban"). Se traen por
  // páginas con orden estable hasta que venga una página corta.
  const PAGINA = 1000
  const articulosTodos: Articulo[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await supabase
      .from('articulos')
      .select('*')
      .eq('activo', true)
      .order('marca').order('nombre').order('id')
      .range(desde, desde + PAGINA - 1)
    if (error) { console.error('[inventario] error cargando catálogo:', error.message); break }
    articulosTodos.push(...((data ?? []) as Articulo[]))
    if (!data || data.length < PAGINA) break
  }

  const [{ filas, sedes: columnasSedes }, sedesRes] = await Promise.all([
    getStockPorSede(),
    supabase.from('sedes').select('id, codigo, nombre').order('codigo'),
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
        articulos={articulosTodos}
      />
    </div>
  )
}
