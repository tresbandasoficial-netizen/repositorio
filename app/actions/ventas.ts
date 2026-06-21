'use server'

import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'
import { getSiguienteNumeroOrden } from '@/lib/queries/pedidos'
import { normalizarTelefono } from '@/lib/utils/phone'
import { MetodoPago } from '@/types'

export type ItemVenta = {
  articulo_id: string | null
  marca: string
  descripcion: string
  talla: string
  cantidad: number
  precio_venta: number
}

export type VentaInmediataInput = {
  cliente_nombre: string
  cliente_telefono: string
  cliente_cedula: string
  items: ItemVenta[]
  abono: number
  metodo_pago: MetodoPago
  notas: string
}

export type VentaResult =
  | { ok: true; pedidoId: string }
  | { ok: false; error: string }

// Venta inmediata: crea un pedido ya ENTREGADO, descuenta inventario de la sede
// del asesor (automático, CPP) y registra el pago. El asesor no toca lotes.
export async function registrarVentaInmediataAction(data: VentaInmediataInput): Promise<VentaResult> {
  const sesion = await getSesion()
  const supabase = await createClient()

  if (!sesion.sede_id) return { ok: false, error: 'Tu usuario no tiene una sede asignada' }
  if (data.items.length === 0) return { ok: false, error: 'Debe haber al menos un producto' }
  if (!data.cliente_nombre.trim()) return { ok: false, error: 'El nombre del cliente es obligatorio' }

  for (const it of data.items) {
    if (it.cantidad <= 0) return { ok: false, error: 'La cantidad debe ser mayor a cero' }
    if (it.precio_venta < 0) return { ok: false, error: 'El precio no puede ser negativo' }
  }

  // Sede del asesor (para numero_orden y descuento de stock).
  const { data: sede } = await supabase
    .from('sedes')
    .select('id, codigo')
    .eq('id', sesion.sede_id)
    .single()
  if (!sede) return { ok: false, error: 'Sede no encontrada' }

  // Cliente: buscar por teléfono o crear.
  const telefono = normalizarTelefono(data.cliente_telefono)
  if (!telefono) return { ok: false, error: 'Teléfono del cliente inválido' }

  const { data: clienteExistente } = await supabase
    .from('clientes')
    .select('id, cedula')
    .eq('telefono_normalizado', telefono)
    .maybeSingle()

  let clienteId: string
  if (clienteExistente) {
    clienteId = clienteExistente.id
    if (data.cliente_cedula.trim() && !clienteExistente.cedula) {
      await supabase.from('clientes').update({ cedula: data.cliente_cedula.trim() }).eq('id', clienteId)
    }
  } else {
    const { data: nuevo, error: errCli } = await supabase
      .from('clientes')
      .insert({
        telefono_normalizado: telefono,
        nombre: data.cliente_nombre.trim(),
        cedula: data.cliente_cedula.trim() || null,
      })
      .select('id')
      .single()
    if (errCli || !nuevo) return { ok: false, error: `Error creando cliente: ${errCli?.message}` }
    clienteId = nuevo.id
  }

  const total = data.items.reduce((s, it) => s + it.precio_venta * it.cantidad, 0)
  if (data.abono > total) return { ok: false, error: 'El abono no puede superar el total' }

  const numeroOrden = await getSiguienteNumeroOrden(sede.codigo)

  const items = data.items.map(it => ({
    articulo_id: it.articulo_id,
    marca: it.marca.trim(),
    descripcion: it.descripcion.trim(),
    talla: it.talla.trim(),
    cantidad: it.cantidad,
    precio_venta: it.precio_venta,
  }))

  const { data: pedidoId, error } = await supabase.rpc('registrar_venta_inmediata', {
    p_numero_orden: numeroOrden,
    p_sede_id:      sede.id,
    p_asesor_id:    sesion.id,
    p_cliente_id:   clienteId,
    p_total:        total,
    p_items:        items,
    p_abono:        data.abono,
    p_metodo_pago:  data.metodo_pago,
    p_notas:        data.notas.trim() || null,
  })

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'El número de orden ya está en uso, intenta de nuevo' }
    return { ok: false, error: error.message }
  }

  return { ok: true as const, pedidoId }
}
