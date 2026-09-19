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
// Además de las FK (préstamos, envíos USA), la VENTA DE BONOS crea traslados
// sin FK — el vínculo es solo la nota 'Venta de bono BONO-XXXX' (mig. 099):
// anularlo dejaría el bono activo y redimible con la plata borrada de caja.
async function _trasladoVinculado(
  adminClient: ReturnType<typeof createAdminClient>,
  trasladoId: string,
  notas: string | null,
): Promise<string | null> {
  if (/^venta de bono /i.test((notas ?? '').trim())) return 'la venta de un bono regalo'
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

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

// Los saldos NO se calculan sobre todo el histórico: cada cuenta puede tener
// un CORTE (cuentas.fecha_corte + saldo_inicial, mig. 080/108) y lo anterior
// está absorbido en el saldo inicial. Mover un traslado a antes del corte lo
// haría desaparecer del cuadre EN SILENCIO (y al revés, contaría doble).
// Devuelve el corte que se viola, o null si todo bien.
async function _violaCorte(
  adminClient: ReturnType<typeof createAdminClient>,
  cuentaIds: (string | null)[],
  fechas: string[],
): Promise<string | null> {
  const ids = [...new Set(cuentaIds.filter((x): x is string => !!x))]
  if (ids.length === 0) return null
  const { data, error } = await adminClient
    .from('cuentas')
    .select('nombre, fecha_corte')
    .in('id', ids)
  if (error) return `no se pudo verificar el corte de saldos (${error.message})`
  for (const c of (data ?? []) as { nombre: string; fecha_corte: string | null }[]) {
    if (!c.fecha_corte) continue
    for (const f of fechas) {
      if (f < c.fecha_corte) {
        return `la cuenta "${c.nombre}" tiene corte de saldo el ${c.fecha_corte} y este cambio toca el ${f} — lo anterior al corte ya está absorbido en el saldo inicial y editarlo descuadraría la caja en silencio. Usa un ajuste de caja.`
      }
    }
  }
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
  if (!Number.isFinite(data.monto) || data.monto <= 0) return { ok: false, error: 'El monto debe ser mayor a cero' }
  if (!FECHA_RE.test(data.fecha) || Number.isNaN(new Date(`${data.fecha}T12:00:00`).getTime())) {
    return { ok: false, error: 'La fecha no es válida' }
  }
  if (!data.destino_cuenta_id) return { ok: false, error: 'Selecciona la cuenta destino' }
  if (data.origen_cuenta_id && data.origen_cuenta_id === data.destino_cuenta_id) {
    return { ok: false, error: 'Las cuentas de origen y destino deben ser distintas' }
  }

  const adminClient = createAdminClient()

  const { data: actual, error: errActual } = await adminClient
    .from('traslados_caja')
    .select('monto, fecha, origen_cuenta_id, destino_cuenta_id, notas')
    .eq('id', trasladoId)
    .maybeSingle()
  if (errActual) return { ok: false, error: errActual.message }
  if (!actual) return { ok: false, error: 'Traslado no encontrado' }

  const vinculo = await _trasladoVinculado(adminClient, trasladoId, actual.notas)
  if (vinculo) return { ok: false, error: `Este traslado pertenece a ${vinculo} — corrígelo desde ese módulo` }

  // Ni la fecha vieja ni la nueva pueden quedar antes del corte de saldo de
  // NINGUNA cuenta involucrada (las viejas y las nuevas).
  const corte = await _violaCorte(
    adminClient,
    [actual.origen_cuenta_id, actual.destino_cuenta_id, data.origen_cuenta_id, data.destino_cuenta_id],
    [actual.fecha, data.fecha],
  )
  if (corte) return { ok: false, error: `No se puede corregir: ${corte}` }

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
  const { error: errHist } = await adminClient.from('historial_cambios').insert({
    tabla:          'traslados_caja',
    registro_id:    trasladoId,
    campo:          'correccion',
    valor_anterior: JSON.stringify(actual),
    valor_nuevo:    JSON.stringify({ monto: Math.round(data.monto), fecha: data.fecha, origen_cuenta_id: data.origen_cuenta_id, destino_cuenta_id: data.destino_cuenta_id }),
    motivo:         data.motivo.trim(),
    usuario_id:     sesion.id,
  })

  revalidatePath('/consignaciones')
  revalidatePath('/flujo-caja')

  if (errHist) {
    // La corrección SÍ quedó aplicada; lo que falló fue la constancia.
    return { ok: false, error: `La corrección quedó aplicada, pero NO se pudo guardar la constancia en el historial (${errHist.message}). Avísale a soporte para dejarla registrada.` }
  }
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

  const { data: actual, error: errActual } = await adminClient
    .from('traslados_caja')
    .select('monto, fecha, origen_cuenta_id, destino_cuenta_id, notas')
    .eq('id', trasladoId)
    .maybeSingle()
  if (errActual) return { ok: false, error: errActual.message }
  if (!actual) return { ok: false, error: 'Traslado no encontrado' }

  const vinculo = await _trasladoVinculado(adminClient, trasladoId, actual.notas)
  if (vinculo) return { ok: false, error: `Este traslado pertenece a ${vinculo} — anúlalo desde ese módulo` }

  // Un traslado de ANTES del corte de saldo ya está absorbido en el saldo
  // inicial: borrarlo no le devuelve la plata a nadie y solo daña el histórico.
  const corte = await _violaCorte(
    adminClient,
    [actual.origen_cuenta_id, actual.destino_cuenta_id],
    [actual.fecha],
  )
  if (corte) return { ok: false, error: `No se puede anular: ${corte}` }

  const { data: filas, error } = await adminClient
    .from('traslados_caja')
    .delete()
    .eq('id', trasladoId)
    .select('id')
  if (error) return { ok: false, error: error.message }
  if (!filas || filas.length === 0) return { ok: false, error: 'El traslado ya no existe' }

  // La fila desaparece de la caja, pero el historial guarda qué era y por qué
  // se anuló — nada de plata borrada en silencio.
  const { error: errHist } = await adminClient.from('historial_cambios').insert({
    tabla:          'traslados_caja',
    registro_id:    trasladoId,
    campo:          'eliminado',
    valor_anterior: JSON.stringify(actual),
    valor_nuevo:    null,
    motivo:         motivo.trim(),
    usuario_id:     sesion.id,
  })

  revalidatePath('/consignaciones')
  revalidatePath('/flujo-caja')

  if (errHist) {
    return { ok: false, error: `La anulación quedó aplicada, pero NO se pudo guardar la constancia en el historial (${errHist.message}). Avísale a soporte para dejarla registrada.` }
  }
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
