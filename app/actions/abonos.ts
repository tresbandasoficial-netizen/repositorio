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

  // 1. Todos los pedidos no cancelados del cliente, con pagos de AMBAS tablas
  const { data: pedidosRaw, error: errPedidos } = await supabase
    .from('pedidos')
    .select(`
      id, total, factura_id, fecha_creacion,
      pagos(monto),
      facturas!factura_id(pagos_factura(monto))
    `)
    .eq('cliente_id', data.cliente_id)
    .neq('estado', 'cancelado')
    .order('fecha_creacion', { ascending: true })

  if (errPedidos) return { ok: false, error: errPedidos.message }

  // 2. Calcular saldo real por pedido (pagos + pagos_factura)
  const pendientes = (pedidosRaw ?? [])
    .map((p: any) => {
      const pagado_directo   = (p.pagos ?? []).reduce((s: number, pg: any) => s + pg.monto, 0)
      const pagado_factura   = (p.facturas?.pagos_factura ?? []).reduce((s: number, pf: any) => s + pf.monto, 0)
      const total_pagado     = pagado_directo + pagado_factura
      return { id: p.id, total: p.total, total_pagado, factura_id: p.factura_id as string | null, fecha_creacion: p.fecha_creacion }
    })
    .filter(p => p.total > p.total_pagado)

  if (pendientes.length === 0) return { ok: false, error: 'El cliente no tiene deuda pendiente' }

  // 3. Distribuir monto del más antiguo al más nuevo
  let restante = data.monto

  for (const p of pendientes) {
    if (restante <= 0) break
    const saldo   = p.total - p.total_pagado
    const aplicar = Math.min(restante, saldo)
    restante -= aplicar

    const base = {
      monto:     aplicar,
      metodo:    data.metodo,
      cuenta_id: data.cuenta_id,
      fecha:     hoy,
      asesor_id: sesion.id,
      notas:     data.notas.trim() || null,
    }

    const { error } = p.factura_id
      ? await supabase.from('pagos_factura').insert({ ...base, factura_id: p.factura_id })
      : await supabase.from('pagos').insert({ ...base, pedido_id: p.id })

    if (error) return { ok: false, error: error.message }
  }

  revalidatePath(`/clientes/${data.cliente_id}`)
  revalidatePath('/cartera')
  revalidatePath('/cuadre')

  return { ok: true, aplicado: data.monto - restante, sobrante: restante }
}
