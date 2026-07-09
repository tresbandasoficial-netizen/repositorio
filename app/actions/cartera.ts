'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSesion } from '@/lib/auth/acceso'
import { normalizarTelefono } from '@/lib/utils/phone'
import { asignarNumeroOrden } from '@/lib/queries/pedidos'

export type CargarSaldoInput = {
  cliente_id: string | null      // cliente existente, o null para crear uno nuevo
  cliente_nombre: string
  cliente_telefono: string
  sede_id: string
  valor: number
  notas: string
}

export type CargarSaldoResult =
  | { ok: true; pedidoId: string; numeroOrden: string }
  | { ok: false; error: string }

// Carga un saldo antiguo de un cliente (deuda de pedidos anteriores al sistema).
// Crea un pedido "entregado" por el valor adeudado y sin abonos: el saldo
// aparece en Cartera y en la ficha del cliente, y se le registran pagos con el
// flujo normal de pedidos hasta saldarlo.
export async function cargarSaldoAntiguoAction(data: CargarSaldoInput): Promise<CargarSaldoResult> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return { ok: false, error: 'Solo un administrador puede cargar saldos antiguos' }

  if (!Number.isFinite(data.valor) || data.valor <= 0) {
    return { ok: false, error: 'El valor de la deuda debe ser mayor a cero' }
  }
  if (!data.sede_id) return { ok: false, error: 'Selecciona la sede' }

  const admin = createAdminClient()

  // Resolver el cliente: existente por id, existente por teléfono, o nuevo.
  let clienteId = data.cliente_id
  if (!clienteId) {
    const telefono = normalizarTelefono(data.cliente_telefono)
    if (!telefono) return { ok: false, error: 'Teléfono del cliente inválido' }
    if (!data.cliente_nombre.trim()) return { ok: false, error: 'El nombre del cliente es obligatorio' }

    const { data: existente } = await admin
      .from('clientes').select('id').eq('telefono_normalizado', telefono).maybeSingle()
    if (existente) {
      clienteId = existente.id
    } else {
      const { data: nuevo, error: errCli } = await admin
        .from('clientes')
        .insert({ telefono_normalizado: telefono, nombre: data.cliente_nombre.trim() })
        .select('id')
        .single()
      if (errCli || !nuevo) return { ok: false, error: `Error creando cliente: ${errCli?.message}` }
      clienteId = nuevo.id
    }
  }

  const { data: sede } = await admin.from('sedes').select('id, codigo').eq('id', data.sede_id).maybeSingle()
  if (!sede) return { ok: false, error: 'Sede no encontrada' }

  const numeroOrden = await asignarNumeroOrden(sede.codigo)
  if (!numeroOrden) return { ok: false, error: 'No se pudo asignar el número. Intenta de nuevo.' }

  const notas = ['Saldo anterior (deuda migrada al sistema)', data.notas.trim()]
    .filter(Boolean).join(' · ')

  const { data: pedido, error: errPedido } = await admin
    .from('pedidos')
    .insert({
      numero_orden: numeroOrden,
      cliente_id:   clienteId,
      sede_id:      sede.id,
      asesor_id:    sesion.id,
      estado:       'entregado',
      total:        Math.round(data.valor),
      notas,
    })
    .select('id')
    .single()

  if (errPedido || !pedido) return { ok: false, error: `Error creando la deuda: ${errPedido?.message}` }

  revalidatePath('/cartera')
  revalidatePath('/clientes')
  return { ok: true, pedidoId: pedido.id, numeroOrden }
}
