'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'

export type ResultadoGastoFijo = { ok: true } | { ok: false; error: string }

// Crear o editar un gasto fijo (solo admin — RLS también lo exige en la BD).
// Al crear se exige la sede (el punto de equilibrio se calcula por sede).
export async function guardarGastoFijoAction(datos: {
  id?: string
  concepto: string
  monto: number
  sede_id?: string | null
}): Promise<ResultadoGastoFijo> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return { ok: false, error: 'Solo administradores' }

  const concepto = datos.concepto.trim()
  if (!concepto) return { ok: false, error: 'El concepto es obligatorio' }
  if (!(datos.monto >= 0)) return { ok: false, error: 'El monto no puede ser negativo' }
  if (!datos.id && !datos.sede_id) {
    return { ok: false, error: 'Elige la pestaña de una sede para agregar el gasto ahí' }
  }

  const supabase = await createClient()
  const { error } = datos.id
    ? await supabase.from('gastos_fijos').update({ concepto, monto: datos.monto }).eq('id', datos.id)
    : await supabase.from('gastos_fijos').insert({ concepto, monto: datos.monto, sede_id: datos.sede_id })

  if (error) return { ok: false, error: error.message }
  revalidatePath('/gastos-fijos')
  return { ok: true }
}

// Marcar/desmarcar un gasto fijo como ya pagado en un mes (mes = 'YYYY-MM-01').
export async function marcarPagoGastoFijoAction(datos: {
  gasto_fijo_id: string
  mes: string
  pagado: boolean
}): Promise<ResultadoGastoFijo> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return { ok: false, error: 'Solo administradores' }

  const supabase = await createClient()
  const { error } = datos.pagado
    ? await supabase.from('gastos_fijos_pagos').upsert(
        { gasto_fijo_id: datos.gasto_fijo_id, mes: datos.mes, usuario_id: sesion.id },
        { onConflict: 'gasto_fijo_id,mes' },
      )
    : await supabase.from('gastos_fijos_pagos').delete()
        .eq('gasto_fijo_id', datos.gasto_fijo_id).eq('mes', datos.mes)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/gastos-fijos')
  return { ok: true }
}

export async function eliminarGastoFijoAction(id: string): Promise<ResultadoGastoFijo> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return { ok: false, error: 'Solo administradores' }

  const supabase = await createClient()
  const { error } = await supabase.from('gastos_fijos').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/gastos-fijos')
  return { ok: true }
}
