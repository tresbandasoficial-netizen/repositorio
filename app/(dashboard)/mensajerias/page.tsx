import { redirect } from 'next/navigation'
import { getSesion } from '@/lib/auth/acceso'
import {
  getCuadresMensajeriasAction,
  getRecaudosPendientesAction,
  getLiquidacionesHistorialAction,
  getDomiciliosPagadosTBAction,
} from '@/app/actions/mensajerias'
import { hoyBogota } from '@/lib/utils/format'
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

  // Domicilios que paga TB: se traen los últimos 60 días; la pantalla filtra por rango.
  const desde = new Date(Date.parse(`${hoyBogota()}T00:00:00Z`) - 60 * 86_400_000).toISOString().slice(0, 10)

  const [cuadres, recaudos, liquidaciones, domiciliosTB] = await Promise.all([
    getCuadresMensajeriasAction(),
    getRecaudosPendientesAction(activaMensajeria),
    getLiquidacionesHistorialAction(activaMensajeria),
    getDomiciliosPagadosTBAction(activaMensajeria, desde),
  ])

  return (
    <MensajeriasClientPage
      key={activaMensajeria}
      cuadres={cuadres}
      recaudos={recaudos}
      liquidaciones={liquidaciones}
      domiciliosTB={domiciliosTB}
      activaMensajeria={activaMensajeria}
    />
  )
}
