import { redirect } from 'next/navigation'
import { getSesion } from '@/lib/auth/acceso'
import {
  getCuadresMensajeriasAction,
  getRecaudosPendientesAction,
  getDomiciliosTBPendientesAction,
  getLiquidacionesHistorialAction,
} from '@/app/actions/mensajerias'
import { getCuentasAction } from '@/app/actions/cuentas'
import { TipoMensajeria } from '@/types'
import { MensajeriasClientPage } from '@/components/mensajerias/MensajeriasClientPage'

export default async function MensajeriasPage({
  searchParams,
}: {
  searchParams: Promise<{ mensajeria?: string }>
}) {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') redirect('/dashboard')

  const sp = await searchParams
  const activaMensajeria = (sp.mensajeria as TipoMensajeria) || 'exneider'

  const [cuadres, recaudos, domiciliosTB, liquidaciones, cuentas] = await Promise.all([
    getCuadresMensajeriasAction(),
    getRecaudosPendientesAction(activaMensajeria),
    getDomiciliosTBPendientesAction(activaMensajeria),
    getLiquidacionesHistorialAction(activaMensajeria),
    getCuentasAction(),
  ])

  return (
    <MensajeriasClientPage
      cuadres={cuadres}
      recaudos={recaudos}
      domiciliosTB={domiciliosTB}
      liquidaciones={liquidaciones}
      cuentas={cuentas}
      activaMensajeria={activaMensajeria}
    />
  )
}
