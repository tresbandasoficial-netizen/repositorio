import { redirect } from 'next/navigation'
import { getSesion } from '@/lib/auth/acceso'
import {
  getCuadresMensajeriasAction,
  getRecaudosPendientesAction,
  getLiquidacionesHistorialAction,
} from '@/app/actions/mensajerias'
import { TipoMensajeria } from '@/types'
import { MensajeriasClientPage } from '@/components/mensajerias/MensajeriasClientPage'

export default async function MensajeriasPage({
  searchParams,
}: {
  searchParams: Promise<{ mensajeria?: string }>
}) {
  const sesion = await getSesion()
  // Asesores y admin pueden ver Mensajerías: los asesores son quienes cuadran
  // con el mensajero. El visor (solo lectura) no entra a esta pantalla operativa.
  if (sesion.rol !== 'admin' && sesion.rol !== 'asesor') redirect('/dashboard')

  const sp = await searchParams
  const activaMensajeria: TipoMensajeria = sp.mensajeria === 'servigo' ? 'servigo' : 'exneider'

  const [cuadres, recaudos, liquidaciones] = await Promise.all([
    getCuadresMensajeriasAction(),
    getRecaudosPendientesAction(activaMensajeria),
    getLiquidacionesHistorialAction(activaMensajeria),
  ])

  return (
    <MensajeriasClientPage
      key={activaMensajeria}
      cuadres={cuadres}
      recaudos={recaudos}
      liquidaciones={liquidaciones}
      activaMensajeria={activaMensajeria}
    />
  )
}
