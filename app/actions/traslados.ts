'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSesion } from '@/lib/auth/acceso'
import { hoyBogota } from '@/lib/utils/format'

export type TrasladoInput = {
  origen_cuenta_id: string
  destino_cuenta_id: string
  monto: number
  fecha?: string
  notas?: string
}

export type TrasladoResult = { ok: true } | { ok: false; error: string }

// Registra un traslado de plata de una cuenta a otra (baja la origen, sube la
// destino). Caso típico: "Entrega de efectivo" — los asesores le dan el dinero
// al dueño, así que pasa de "Efectivo" a "Caja Bucaramanga".
export async function registrarTrasladoAction(data: TrasladoInput): Promise<TrasladoResult> {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') return { ok: false, error: 'Sin permisos para registrar traslados' }
  if (data.monto <= 0) return { ok: false, error: 'El monto debe ser mayor a cero' }
  if (!data.origen_cuenta_id || !data.destino_cuenta_id) return { ok: false, error: 'Selecciona las cuentas de origen y destino' }
  if (data.origen_cuenta_id === data.destino_cuenta_id) return { ok: false, error: 'Las cuentas de origen y destino deben ser distintas' }

  const supabase = await createClient()
  const { error } = await supabase.from('traslados_caja').insert({
    origen_cuenta_id:  data.origen_cuenta_id,
    destino_cuenta_id: data.destino_cuenta_id,
    monto:             data.monto,
    fecha:             data.fecha || hoyBogota(),
    responsable_id:    sesion.id,
    notas:             data.notas?.trim() || null,
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/flujo-caja')
  return { ok: true }
}

// ─── Corregir / anular traslados (solo admin) ────────────────────────────────
// Pedido de Johan (19-sep-2026): poder corregir él mismo una consignación mal
// registrada (cuenta equivocada, monto, fecha) sin pedirle el ajuste a nadie.
// Un traslado que pertenece a un préstamo o a un envío USA NO se toca aquí:
// se corrige desde su módulo, si no la deuda y la caja quedan diciendo cosas
// distintas.

// ¿Este traslado lo creó otro módulo? Devuelve el nombre del módulo, o null.
async function _trasladoVinculado(
  adminClient: ReturnType<typeof createAdminClient>,
  trasladoId: string,
): Promise<string | null> {
  const [abono, envio, prestamo] = await Promise.all([
    adminClient.from('abonos_prestamos').select('id').eq('traslado_id', trasladoId).limit(1),
    adminClient.from('envios_usa').select('id').eq('traslado_id', trasladoId).limit(1),
    adminClient.from('prestamos_terceros').select('id').eq('ingreso_traslado_id', trasladoId).limit(1),
  ])
  // Un error aquí bloquea (fail closed): mejor no editar que editar a ciegas.
  if (abono.error || envio.error || prestamo.error) return 'otro módulo (no se pudo verificar)'
  if ((abono.data ?? []).length > 0) return 'un abono de préstamo'
  if ((envio.data ?? []).length > 0) return 'un envío USA'
  if ((prestamo.data ?? []).length > 0) return 'un préstamo'
  return null
}

export type EditarTrasladoInput = {
  monto: number
  fecha: string
  origen_cuenta_id: string | null   // null = ingreso externo (sin cuenta origen)
  destino_cuenta_id: string
  notas: string
  motivo: string                    // por qué se corrige — obligatorio, queda en historial
}

export async function editarTrasladoAction(
  trasladoId: string,
  data: EditarTrasladoInput,
): Promise<TrasladoResult> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return { ok: false, error: 'Solo el administrador puede corregir traslados' }
  if (!data.motivo.trim()) return { ok: false, error: 'Escribe el motivo de la corrección' }
  if (data.monto <= 0) return { ok: false, error: 'El monto debe ser mayor a cero' }
  if (!data.destino_cuenta_id) return { ok: false, error: 'Selecciona la cuenta destino' }
  if (data.origen_cuenta_id && data.origen_cuenta_id === data.destino_cuenta_id) {
    return { ok: false, error: 'Las cuentas de origen y destino deben ser distintas' }
  }

  const adminClient = createAdminClient()
  const vinculo = await _trasladoVinculado(adminClient, trasladoId)
  if (vinculo) return { ok: false, error: `Este traslado pertenece a ${vinculo} — corrígelo desde ese módulo` }

  const { data: actual, error: errActual } = await adminClient
    .from('traslados_caja')
    .select('monto, fecha, origen_cuenta_id, destino_cuenta_id, notas')
    .eq('id', trasladoId)
    .maybeSingle()
  if (errActual) return { ok: false, error: errActual.message }
  if (!actual) return { ok: false, error: 'Traslado no encontrado' }

  const { data: filas, error } = await adminClient
    .from('traslados_caja')
    .update({
      monto:             Math.round(data.monto),
      fecha:             data.fecha,
      origen_cuenta_id:  data.origen_cuenta_id,
      destino_cuenta_id: data.destino_cuenta_id,
      notas:             data.notas.trim() || null,
    })
    .eq('id', trasladoId)
    .select('id')
  if (error) return { ok: false, error: error.message }
  if (!filas || filas.length === 0) return { ok: false, error: 'El traslado ya no existe' }

  // Constancia en el historial: qué decía, qué dice ahora y por qué.
  await adminClient.from('historial_cambios').insert({
    tabla:          'traslados_caja',
    registro_id:    trasladoId,
    campo:          'correccion',
    valor_anterior: JSON.stringify(actual),
    valor_nuevo:    JSON.stringify({ monto: Math.round(data.monto), fecha: data.fecha, origen_cuenta_id: data.origen_cuenta_id, destino_cuenta_id: data.destino_cuenta_id, motivo: data.motivo.trim() }),
    usuario_id:     sesion.id,
  })

  revalidatePath('/consignaciones')
  revalidatePath('/flujo-caja')
  return { ok: true }
}

export async function eliminarTrasladoAction(
  trasladoId: string,
  motivo: string,
): Promise<TrasladoResult> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return { ok: false, error: 'Solo el administrador puede anular traslados' }
  if (!motivo.trim()) return { ok: false, error: 'Escribe el motivo de la anulación' }

  const adminClient = createAdminClient()
  const vinculo = await _trasladoVinculado(adminClient, trasladoId)
  if (vinculo) return { ok: false, error: `Este traslado pertenece a ${vinculo} — anúlalo desde ese módulo` }

  const { data: actual, error: errActual } = await adminClient
    .from('traslados_caja')
    .select('monto, fecha, origen_cuenta_id, destino_cuenta_id, notas')
    .eq('id', trasladoId)
    .maybeSingle()
  if (errActual) return { ok: false, error: errActual.message }
  if (!actual) return { ok: false, error: 'Traslado no encontrado' }

  const { data: filas, error } = await adminClient
    .from('traslados_caja')
    .delete()
    .eq('id', trasladoId)
    .select('id')
  if (error) return { ok: false, error: error.message }
  if (!filas || filas.length === 0) return { ok: false, error: 'El traslado ya no existe' }

  // La fila desaparece de la caja, pero el historial guarda qué era y por qué
  // se anuló — nada de plata borrada en silencio.
  await adminClient.from('historial_cambios').insert({
    tabla:          'traslados_caja',
    registro_id:    trasladoId,
    campo:          'eliminado',
    valor_anterior: JSON.stringify(actual),
    valor_nuevo:    motivo.trim(),
    usuario_id:     sesion.id,
  })

  revalidatePath('/consignaciones')
  revalidatePath('/flujo-caja')
  return { ok: true }
}

export type IngresoInput = {
  cuenta_id: string
  monto: number
  fecha?: string
  notas?: string
}

// Registra dinero que ENTRA de afuera a una cuenta (no es venta ni traslado entre
// cuentas): aporte de capital, préstamo, devolución de proveedor, etc. Se guarda
// como un traslado sin origen (origen_cuenta_id = null), que el flujo de caja suma
// al destino sin descontar ninguna otra cuenta.
export async function registrarIngresoAction(data: IngresoInput): Promise<TrasladoResult> {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') return { ok: false, error: 'Sin permisos para registrar ingresos' }
  if (data.monto <= 0) return { ok: false, error: 'El monto debe ser mayor a cero' }
  if (!data.cuenta_id) return { ok: false, error: 'Selecciona la cuenta que recibe el dinero' }

  const supabase = await createClient()
  const { error } = await supabase.from('traslados_caja').insert({
    origen_cuenta_id:  null,
    destino_cuenta_id: data.cuenta_id,
    monto:             data.monto,
    fecha:             data.fecha || hoyBogota(),
    responsable_id:    sesion.id,
    notas:             data.notas?.trim() || null,
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/flujo-caja')
  return { ok: true }
}
