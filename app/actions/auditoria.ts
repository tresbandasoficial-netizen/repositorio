'use server'

import { revalidatePath } from 'next/cache'
import { getSesion } from '@/lib/auth/acceso'
import { hoyBogota } from '@/lib/utils/format'
import { generarInformeSede } from '@/lib/auditoria/informe'

// Botón "Actualizar informe": solo admin. Solo lee y guarda el informe.
export async function generarAuditoriaAction(codigoSede: string, fecha?: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return { ok: false, error: 'Solo el administrador puede generar la auditoría' }
  if (!/^[A-Z]{2}$/.test(codigoSede)) return { ok: false, error: 'Sede inválida' }
  const dia = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : hoyBogota()
  const r = await generarInformeSede(codigoSede, dia)
  if (!r.ok) return { ok: false, error: r.error }
  revalidatePath('/auditoria')
  return { ok: true }
}
