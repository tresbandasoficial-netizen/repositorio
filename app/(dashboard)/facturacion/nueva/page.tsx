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

  const { data: usuario } = await supabase.from('usuarios').select('nombre').eq('id', sesion.id).single()
  const asesorNombre = usuario?.nombre ?? ''

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <NuevaFacturaForm sedes={sedes} asesorNombre={asesorNombre} />
    </div>
  )
}
