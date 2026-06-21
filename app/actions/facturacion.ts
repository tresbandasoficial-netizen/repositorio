'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'
import { MetodoPago } from '@/types'

export type CrearFacturaInput = {
  cliente_id: string
  pedido_ids: string[]
  fecha_vencimiento: string
  notas: string
  abono_inicial: number
  metodo_abono: MetodoPago
}

export type CrearFacturaResult =
  | { ok: true; facturaId: string }
  | { ok: false; error: string }

// Crea una factura agrupando 1..N pedidos entregados del mismo cliente y sede.
export async function crearFacturaAction(data: CrearFacturaInput): Promise<CrearFacturaResult> {
  const sesion = await getSesion()
  const supabase = await createClient()

  if (data.pedido_ids.length === 0) return { ok: false, error: 'Selecciona al menos un pedido' }
  if (!data.fecha_vencimiento) return { ok: false, error: 'La fecha de vencimiento es obligatoria' }

  // La sede de la factura = sede de los pedidos. Validamos que todos compartan sede
  // y que el asesor tenga acceso a ella.
  const { data: pedidos, error: errPed } = await supabase
    .from('pedidos')
    .select('id, sede_id, cliente_id, estado, factura_id')
    .in('id', data.pedido_ids)

  if (errPed) return { ok: false, error: errPed.message }
  if (!pedidos || pedidos.length !== data.pedido_ids.length) {
    return { ok: false, error: 'Algún pedido no existe' }
  }

  const sedeIds = new Set(pedidos.map(p => p.sede_id))
  if (sedeIds.size > 1) return { ok: false, error: 'Todos los pedidos deben ser de la misma sede' }
  const sedeId = pedidos[0].sede_id

  if (sesion.rol !== 'admin' && sedeId !== sesion.sede_id) {
    return { ok: false, error: 'No puedes facturar pedidos de otra sede' }
  }
  if (pedidos.some(p => p.cliente_id !== data.cliente_id)) {
    return { ok: false, error: 'Todos los pedidos deben ser del mismo cliente' }
  }
  if (pedidos.some(p => p.estado !== 'entregado')) {
    return { ok: false, error: 'Solo se pueden facturar pedidos entregados' }
  }
  if (pedidos.some(p => p.factura_id)) {
    return { ok: false, error: 'Algún pedido ya está facturado' }
  }

  const { data: facturaId, error } = await supabase.rpc('crear_factura', {
    p_cliente_id:        data.cliente_id,
    p_sede_id:           sedeId,
    p_asesor_id:         sesion.id,
    p_fecha_vencimiento: data.fecha_vencimiento,
    p_pedido_ids:        data.pedido_ids,
    p_notas:             data.notas.trim() || null,
    p_abono_inicial:     data.abono_inicial || 0,
    p_metodo_abono:      data.metodo_abono || null,
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/facturacion')
  return { ok: true as const, facturaId }
}

export type PagoFacturaInput = {
  factura_id: string
  monto: number
  metodo: MetodoPago
  fecha: string
  notas: string
}

export type SimpleResult = { ok: true } | { ok: false; error: string }

export async function registrarPagoFacturaAction(data: PagoFacturaInput): Promise<SimpleResult> {
  const sesion = await getSesion()
  const supabase = await createClient()

  if (data.monto <= 0) return { ok: false, error: 'El monto debe ser mayor a cero' }

  // Verificar acceso a la factura por sede.
  const { data: factura } = await supabase
    .from('facturas')
    .select('sede_id, estado')
    .eq('id', data.factura_id)
    .single()
  if (!factura) return { ok: false, error: 'Factura no encontrada' }
  if (sesion.rol !== 'admin' && factura.sede_id !== sesion.sede_id) {
    return { ok: false, error: 'Sin acceso a esta factura' }
  }

  const { error } = await supabase.rpc('registrar_pago_factura', {
    p_factura_id: data.factura_id,
    p_monto:      data.monto,
    p_metodo:     data.metodo,
    p_fecha:      data.fecha,
    p_asesor_id:  sesion.id,
    p_notas:      data.notas.trim() || null,
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/facturacion/${data.factura_id}`)
  redirect(`/facturacion/${data.factura_id}`)
}

// Anular factura: libera los pedidos vinculados. Solo admin.
export async function anularFacturaAction(facturaId: string): Promise<SimpleResult> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return { ok: false, error: 'Solo el administrador puede anular facturas' }
  const supabase = await createClient()

  const { error } = await supabase.rpc('anular_factura', { p_factura_id: facturaId })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/facturacion')
  return { ok: true }
}
