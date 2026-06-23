'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'
import { MetodoPago } from '@/types'

export type AbonarClienteInput = {
  cliente_id: string
  monto: number
  metodo: MetodoPago
  cuenta_id: string
  notas: string
}

export type AbonarClienteResult =
  | { ok: true; aplicado: number; sobrante: number }
  | { ok: false; error: string }

export async function abonarClienteAction(data: AbonarClienteInput): Promise<AbonarClienteResult> {
  const sesion = await getSesion()
  const supabase = await createClient()
  const hoy = new Date().toISOString().slice(0, 10)

  // 1. Pedidos pendientes del cliente, del más antiguo al más nuevo
  const { data: vista } = await supabase
    .from('vista_pedidos_asesor')
    .select('id, total, total_pagado, fecha_creacion')
    .eq('cliente_id', data.cliente_id)
    .order('fecha_creacion', { ascending: true })

  const pendientes = (vista ?? []).filter(p => p.total > p.total_pagado)
  if (pendientes.length === 0) return { ok: false, error: 'El cliente no tiene deuda pendiente' }

  // 2. Obtener factura_id de cada pedido pendiente
  const { data: pedidosRaw } = await supabase
    .from('pedidos')
    .select('id, factura_id')
    .in('id', pendientes.map(p => p.id))

  const facMap = new Map((pedidosRaw ?? []).map(p => [p.id, p.factura_id as string | null]))

  // 3. Distribuir monto del más antiguo al más nuevo
  let restante = data.monto

  for (const p of pendientes) {
    if (restante <= 0) break
    const saldo = p.total - p.total_pagado
    const aplicar = Math.min(restante, saldo)
    restante -= aplicar

    const factura_id = facMap.get(p.id) ?? null
    const base = {
      monto:     aplicar,
      metodo:    data.metodo,
      cuenta_id: data.cuenta_id,
      fecha:     hoy,
      asesor_id: sesion.id,
      notas:     data.notas.trim() || null,
    }

    const { error } = factura_id
      ? await supabase.from('pagos_factura').insert({ ...base, factura_id })
      : await supabase.from('pagos').insert({ ...base, pedido_id: p.id })

    if (error) return { ok: false, error: error.message }
  }

  revalidatePath(`/clientes/${data.cliente_id}`)
  revalidatePath('/cartera')
  revalidatePath('/cuadre')

  return { ok: true, aplicado: data.monto - restante, sobrante: restante }
}
