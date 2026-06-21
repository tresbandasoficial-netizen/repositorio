import { getSesion } from '@/lib/auth/acceso'
import { createClient } from '@/lib/supabase/server'
import { VentaInmediataForm } from '@/components/ventas/VentaInmediataForm'

export default async function VentaPage() {
  const sesion = await getSesion()
  const supabase = await createClient()

  // Admin: puede vender desde cualquier sede. Asesor: solo la suya.
  let sedes: { id: string; codigo: string; nombre: string }[] = []
  if (sesion.rol === 'admin') {
    const { data } = await supabase.from('sedes').select('id, codigo, nombre').order('codigo')
    sedes = (data ?? []) as typeof sedes
  } else if (sesion.sede_id) {
    const { data } = await supabase.from('sedes').select('id, codigo, nombre').eq('id', sesion.sede_id).single()
    if (data) sedes = [data]
  }

  if (sedes.length === 0) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800">
          Tu usuario no tiene una sede asignada. Pídele a un administrador que te asigne una sede
          para poder registrar ventas.
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Venta rápida</h1>
      <p className="text-sm text-gray-500 mb-6">
        Producto disponible en tienda. Se entrega de inmediato y descuenta inventario.
      </p>
      <VentaInmediataForm sedes={sedes} />
    </div>
  )
}
