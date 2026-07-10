import { redirect } from 'next/navigation'
import { getSesion } from '@/lib/auth/acceso'
import { createClient } from '@/lib/supabase/server'
import { getBonosAction } from '@/app/actions/bonos'
import { BonosClientPage } from '@/components/bonos/BonosClientPage'

export default async function BonosPage() {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') redirect('/pedidos')

  const supabase = await createClient()
  const [bonos, { data: cuentasRaw }] = await Promise.all([
    getBonosAction(),
    supabase.from('cuentas')
      .select('id, nombre, metodo_pago, sede_id')
      .eq('activa', true)
      .not('metodo_pago', 'is', null)
      .neq('tipo', 'credito')
      .order('orden'),
  ])

  // Asesor: solo cuentas de dinero real de su sede (efectivo de su sede + globales).
  let cuentas = (cuentasRaw ?? []) as Array<{ id: string; nombre: string; metodo_pago: string | null; sede_id: string | null }>
  if (sesion.rol !== 'admin' && sesion.sede_id) {
    cuentas = cuentas.filter(c => c.metodo_pago !== 'efectivo' || c.sede_id === sesion.sede_id)
  }

  return <BonosClientPage bonos={bonos} cuentas={cuentas.map(c => ({ id: c.id, nombre: c.nombre }))} />
}
