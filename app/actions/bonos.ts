'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSesion } from '@/lib/auth/acceso'
import { hoyBogota } from '@/lib/utils/format'

export type Bono = {
  id: string
  codigo: string
  valor_inicial: number
  saldo: number
  estado: 'activo' | 'agotado' | 'anulado'
  comprador: string | null
  notas: string | null
  creado_en: string
  cuenta_nombre: string | null
  sede_codigo: string | null
  vendido_por_nombre: string | null
}

export type CrearBonoInput = {
  valor: number
  cuenta_id: string | null
  comprador: string
  notas: string
}
export type CrearBonoResult = { ok: true; codigo: string } | { ok: false; error: string }

// Vender un bono: la plata entra a la cuenta elegida; se genera el código.
export async function crearBonoAction(data: CrearBonoInput): Promise<CrearBonoResult> {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') return { ok: false, error: 'Sin permisos para vender bonos' }
  if (!Number.isFinite(data.valor) || data.valor <= 0) return { ok: false, error: 'El valor del bono debe ser mayor a cero' }
  if (!data.cuenta_id) return { ok: false, error: 'Selecciona la cuenta donde entró el dinero del bono' }

  const supabase = await createClient()
  const { data: codigo, error } = await supabase.rpc('crear_bono', {
    p_valor:     Math.round(data.valor),
    p_cuenta_id: data.cuenta_id,
    p_sede_id:   sesion.sede_id,
    p_comprador: data.comprador,
    p_notas:     data.notas,
    p_usuario_id: sesion.id,
  })
  if (error || !codigo) return { ok: false, error: error?.message ?? 'Error creando el bono' }

  revalidatePath('/bonos')
  revalidatePath('/flujo-caja')
  return { ok: true, codigo: codigo as string }
}

export async function getBonosAction(): Promise<Bono[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('bonos_regalo')
    .select('id, codigo, valor_inicial, saldo, estado, comprador, notas, creado_en, cuenta:cuentas(nombre), sede:sedes(codigo), vendedor:usuarios(nombre)')
    .order('creado_en', { ascending: false })
    .limit(300)
  return (data ?? []).map((b: any) => ({
    id: b.id, codigo: b.codigo, valor_inicial: b.valor_inicial, saldo: b.saldo,
    estado: b.estado, comprador: b.comprador, notas: b.notas, creado_en: b.creado_en,
    cuenta_nombre: b.cuenta?.nombre ?? null,
    sede_codigo: b.sede?.codigo ?? null,
    vendido_por_nombre: b.vendedor?.nombre ?? null,
  }))
}

// Consulta el saldo de un bono por código (para el formulario de redención).
export async function consultarBonoAction(codigo: string): Promise<{ ok: true; saldo: number; estado: string } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('bonos_regalo')
    .select('saldo, estado')
    .ilike('codigo', codigo.trim())
    .maybeSingle()
  if (!data) return { ok: false, error: 'No existe un bono con ese código' }
  return { ok: true, saldo: data.saldo, estado: data.estado }
}

export type RedimirResult = { ok: true; saldoRestante: number } | { ok: false; error: string }

// Paga un pedido con un bono (redención). El pedido debe existir con saldo.
export async function pagarPedidoConBonoAction(
  numeroOrden: string, codigo: string, monto: number
): Promise<RedimirResult> {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') return { ok: false, error: 'Sin permisos para redimir bonos' }
  if (!Number.isFinite(monto) || monto <= 0) return { ok: false, error: 'El monto debe ser mayor a cero' }

  const supabase = await createClient()
  const { data: pedido } = await supabase
    .from('pedidos').select('id').eq('numero_orden', numeroOrden.trim().toUpperCase()).maybeSingle()
  if (!pedido) return { ok: false, error: `No existe el pedido "${numeroOrden.trim().toUpperCase()}"` }

  const admin = createAdminClient()
  const { data: saldoRestante, error } = await admin.rpc('pagar_pedido_con_bono', {
    p_pedido_id: pedido.id,
    p_codigo:    codigo,
    p_monto:     Math.round(monto),
    p_asesor_id: sesion.id,
    p_fecha:     hoyBogota(),
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/bonos')
  revalidatePath(`/pedidos/${pedido.id}`)
  return { ok: true, saldoRestante: (saldoRestante as number) ?? 0 }
}
