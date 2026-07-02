'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSesion } from '@/lib/auth/acceso'
import { bloqueoCajaCerrada } from '@/lib/auth/caja'
import { cuentaIdPorMetodo } from '@/lib/queries/cuentas'
import { MetodoPago } from '@/types'
import { hoyBogota } from '@/lib/utils/format'

// ─── Editar / eliminar abonos (desde el perfil del cliente, solo admin) ──────
// Los abonos viven en dos tablas: `pagos` (de pedidos, origen 'pedido') y
// `pagos_factura` (de facturas, origen 'factura'). "Eliminar" = anular
// (anulado=true): reversible, conserva la auditoría y desaparece de los saldos.

type OrigenPago = 'pedido' | 'factura'
const tablaDe = (o: OrigenPago) => (o === 'factura' ? 'pagos_factura' : 'pagos')

export type AbonoResult = { ok: true } | { ok: false; error: string }

export async function editarAbonoAction(id: string, origen: OrigenPago, nuevoMonto: number): Promise<AbonoResult> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return { ok: false, error: 'Solo los administradores pueden editar abonos' }
  if (!(nuevoMonto > 0)) return { ok: false, error: 'El monto debe ser mayor a cero' }

  const admin = createAdminClient()
  const tabla = tablaDe(origen)
  const { data: pago } = await admin.from(tabla).select('monto').eq('id', id).single()
  if (!pago) return { ok: false, error: 'Abono no encontrado' }

  const { error } = await admin.from(tabla).update({ monto: nuevoMonto }).eq('id', id)
  if (error) return { ok: false, error: error.message }

  await admin.from('historial_cambios').insert({
    tabla, registro_id: id, campo: 'monto',
    valor_anterior: String(pago.monto), valor_nuevo: String(nuevoMonto), usuario_id: sesion.id,
  })

  revalidatePath('/clientes', 'layout')
  revalidatePath('/cartera')
  revalidatePath('/cuentas-por-cobrar')
  revalidatePath('/cuadre')
  return { ok: true }
}

// Anula uno o varios pagos (un abono repartido entre pedidos son varias filas).
export async function eliminarAbonoAction(partes: Array<{ id: string; origen: OrigenPago }>): Promise<AbonoResult> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return { ok: false, error: 'Solo los administradores pueden eliminar abonos' }
  if (partes.length === 0) return { ok: false, error: 'Nada que eliminar' }

  const admin = createAdminClient()
  for (const p of partes) {
    const tabla = tablaDe(p.origen)
    const { error } = await admin.from(tabla).update({ anulado: true }).eq('id', p.id)
    if (error) return { ok: false, error: error.message }
    await admin.from('historial_cambios').insert({
      tabla, registro_id: p.id, campo: 'anulado',
      valor_anterior: 'false', valor_nuevo: 'true', usuario_id: sesion.id,
    })
  }

  revalidatePath('/clientes', 'layout')
  revalidatePath('/cartera')
  revalidatePath('/cuentas-por-cobrar')
  revalidatePath('/cuadre')
  return { ok: true }
}

export type AbonarClienteInput = {
  cliente_id: string
  monto: number
  metodo: MetodoPago
  cuenta_id: string | null
  notas: string
}

export type AbonarClienteResult =
  | { ok: true; aplicado: number; sobrante: number }
  | { ok: false; error: string }

export async function abonarClienteAction(data: AbonarClienteInput): Promise<AbonarClienteResult> {
  if (data.monto <= 0) return { ok: false, error: 'El monto debe ser mayor a cero' }

  const sesion = await getSesion()
  if (sesion.rol === 'visor') return { ok: false, error: 'Sin permisos para registrar abonos' }
  const bloqueo = await bloqueoCajaCerrada(sesion)
  if (bloqueo) return { ok: false, error: bloqueo }
  const supabase = await createClient()

  // Toda la distribución del abono ocurre dentro de un único RPC transaccional
  // (FOR UPDATE por pedido) para evitar sobreabono por concurrencia y estados
  // inconsistentes si algo falla a mitad del proceso.
  // Rutear el abono a la cuenta de su método (efectivo → caja de la sede del
  // asesor; demás → su cuenta global) para que el saldo se actualice solo.
  let cuentaId = data.cuenta_id || null
  if (!cuentaId) cuentaId = await cuentaIdPorMetodo(supabase, data.metodo, sesion.sede_id)

  const { data: res, error } = await supabase.rpc('abonar_cliente', {
    p_cliente_id: data.cliente_id,
    p_monto:      data.monto,
    p_metodo:     data.metodo,
    p_cuenta_id:  cuentaId,
    p_asesor_id:  sesion.id,
    p_fecha:      hoyBogota(),
    p_notas:      data.notas.trim() || null,
  })

  if (error) return { ok: false, error: error.message }

  const aplicado = (res as any)?.aplicado ?? 0
  const sobrante = (res as any)?.sobrante ?? data.monto
  if (aplicado === 0) return { ok: false, error: 'El cliente no tiene deuda pendiente' }

  revalidatePath(`/clientes/${data.cliente_id}`)
  revalidatePath('/cartera')
  revalidatePath('/cuadre')

  return { ok: true, aplicado, sobrante }
}
