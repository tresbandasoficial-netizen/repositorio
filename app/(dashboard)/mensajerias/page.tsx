import { redirect } from 'next/navigation'
import { getSesion } from '@/lib/auth/acceso'
import { formatCOP } from '@/lib/utils/format'
import {
  getResumenMensajeriasAction,
  getDomiciliosPendientesMensajeriaAction,
  getHistorialPagosMensajeriaAction,
} from '@/app/actions/mensajerias'
import { getCuentasAction } from '@/app/actions/cuentas'
import { MENSAJERIA_LABELS, TipoMensajeria } from '@/types'
import { MensajeriasClientPage } from '@/components/mensajerias/MensajeriasClientPage'

const MENSAJERIAS: TipoMensajeria[] = ['exneider', 'servigo', 'otro']

export default async function MensajeriasPage({
  searchParams,
}: {
  searchParams: Promise<{ mensajeria?: string }>
}) {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') redirect('/dashboard')

  const sp = await searchParams
  const activaMensajeria = (sp.mensajeria as TipoMensajeria) || 'exneider'

  const [resumenes, pendientes, historial, cuentasRes] = await Promise.all([
    getResumenMensajeriasAction(),
    getDomiciliosPendientesMensajeriaAction(activaMensajeria),
    getHistorialPagosMensajeriaAction(activaMensajeria),
    getCuentasAction(),
  ])

  const cuentas = cuentasRes.ok ? cuentasRes.cuentas : []

  // Completar mensajerías sin datos
  const resumenesCompletos = MENSAJERIAS.map(m => {
    const r = resumenes.find(x => x.mensajeria === m)
    return r ?? { mensajeria: m, total_deuda: 0, total_pagado: 0, saldo_pendiente: 0 }
  })

  return (
    <MensajeriasClientPage
      resumenes={resumenesCompletos}
      pendientes={pendientes}
      historial={historial}
      cuentas={cuentas}
      activaMensajeria={activaMensajeria}
    />
  )
}
