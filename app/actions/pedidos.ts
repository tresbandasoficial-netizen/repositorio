'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { parsearPedido } from '@/lib/parser'
import { normalizarTelefono } from '@/lib/utils/phone'
import { getSiguienteNumeroOrden } from '@/lib/queries/pedidos'
import { puedeTransicionar } from '@/lib/domain/estados'
import { EstadoPedido, MetodoPago } from '@/types'
import { getSesion, puedeAccederSede } from '@/lib/auth/acceso'

export type CrearPedidoResult =
  | { ok: true; pedidoId: string }
  | { ok: false; error: string; siguienteNumero?: string }

export async function crearPedidoAction(
  textoResumen: string,
  numeroOrdenManual: string
): Promise<CrearPedidoResult> {
  const supabase = await createClient()

  // Verificar sesión
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id, nombre, sede_id, sedes(id, codigo)')
    .eq('id', user.id)
    .single()

  if (!usuario) return { ok: false, error: 'Usuario no encontrado' }

  // Parsear (segunda validación — la primera fue en cliente)
  const parseResult = parsearPedido(textoResumen)
  if (!parseResult.ok) return { ok: false, error: parseResult.error }
  const datos = parseResult.data

  // Obtener sede_id desde el código del parser
  const { data: sede } = await supabase
    .from('sedes')
    .select('id, codigo')
    .eq('codigo', datos.sede)
    .single()

  if (!sede) return { ok: false, error: `Sede "${datos.sede}" no encontrada en la base de datos` }

  // Validar número de orden
  const numeroOrden = numeroOrdenManual.trim().toUpperCase()
  if (!numeroOrden) return { ok: false, error: 'El número de orden es obligatorio' }
  if (!numeroOrden.startsWith(datos.sede)) {
    return { ok: false, error: `El número de orden debe empezar con "${datos.sede}" (sede del pedido)` }
  }

  // Upsert cliente por teléfono normalizado
  const telefonoNormalizado = normalizarTelefono(datos.cliente_telefono)
  if (!telefonoNormalizado) return { ok: false, error: 'Teléfono del cliente inválido' }

  const { data: clienteExistente } = await supabase
    .from('clientes')
    .select('id, nombre, cedula')
    .eq('telefono_normalizado', telefonoNormalizado)
    .single()

  let clienteId: string
  let advertenciaNombre: string | null = null

  if (clienteExistente) {
    clienteId = clienteExistente.id

    // Detectar variación de nombre
    const nombreNormalizado = datos.cliente_nombre.trim().toLowerCase()
    const nombreExistente = clienteExistente.nombre.trim().toLowerCase()
    if (nombreNormalizado !== nombreExistente) {
      advertenciaNombre = `El cliente ya existe como "${clienteExistente.nombre}". El resumen trae "${datos.cliente_nombre}". No se actualizó el nombre.`
    }

    // Si viene cédula nueva y el cliente no tenía, agregarla
    if (datos.cliente_doc && !clienteExistente.cedula) {
      const cedulaLimpia = datos.cliente_doc.replace(/^CC\s*/i, '').trim()
      await supabase
        .from('clientes')
        .update({ cedula: cedulaLimpia })
        .eq('id', clienteId)
    }
  } else {
    // Cliente nuevo
    const cedulaLimpia = datos.cliente_doc
      ? datos.cliente_doc.replace(/^CC\s*/i, '').trim()
      : null

    const { data: nuevoCliente, error: errCliente } = await supabase
      .from('clientes')
      .insert({
        telefono_normalizado: telefonoNormalizado,
        nombre: datos.cliente_nombre.trim(),
        cedula: cedulaLimpia,
      })
      .select('id')
      .single()

    if (errCliente || !nuevoCliente) {
      return { ok: false, error: `Error creando cliente: ${errCliente?.message}` }
    }
    clienteId = nuevoCliente.id
  }

  // Crear pedido vía función transaccional
  const items = datos.productos.map((p) => ({
    marca: p.marca,
    descripcion: p.descripcion,
    talla: p.talla ?? '',
    cantidad: p.cantidad,
    precio_venta: p.precio_venta,
  }))

  const { data: pedidoId, error: errPedido } = await supabase.rpc('crear_pedido', {
    p_numero_orden: numeroOrden,
    p_sede_id: sede.id,
    p_asesor_id: usuario.id,
    p_cliente_id: clienteId,
    p_total: datos.total,
    p_tipo_entrega: datos.tipo_entrega,
    p_direccion_entrega: datos.direccion ?? null,
    p_notas: datos.notas ?? null,
    p_items: items,
    p_abono: datos.abono,
    p_metodo_pago: datos.metodo_pago_abono,
  })

  if (errPedido) {
    // UNIQUE violation en numero_orden
    if (errPedido.code === '23505') {
      const siguienteNumero = await getSiguienteNumeroOrden(datos.sede)
      return {
        ok: false,
        error: `El número "${numeroOrden}" ya está en uso.`,
        siguienteNumero,
      }
    }
    return { ok: false, error: `Error creando pedido: ${errPedido.message}` }
  }

  redirect(`/pedidos/${pedidoId}`)
}

// ─── Cambiar estado ───────────────────────────────────────────────────────────

export type CambiarEstadoResult =
  | { ok: true }
  | { ok: false; error: string }

export async function cambiarEstadoAction(
  pedidoId: string,
  estadoActual: EstadoPedido,
  nuevoEstado: EstadoPedido
): Promise<CambiarEstadoResult> {
  const sesion = await getSesion()
  const supabase = await createClient()

  // Verificar que el pedido pertenece a la sede del usuario
  const { data: pedido } = await supabase
    .from('vista_pedidos_asesor')
    .select('sede_id')
    .eq('id', pedidoId)
    .single()

  if (!pedido || !puedeAccederSede(sesion, pedido.sede_id)) {
    return { ok: false, error: 'Sin acceso a este pedido' }
  }

  if (!puedeTransicionar(estadoActual, nuevoEstado, sesion.rol)) {
    return {
      ok: false,
      error: sesion.rol === 'asesor' && nuevoEstado === 'cancelado'
        ? 'Solo el administrador puede cancelar pedidos.'
        : `Transición inválida: ${estadoActual} → ${nuevoEstado}`,
    }
  }

  const { error } = await supabase.rpc('cambiar_estado_pedido', {
    p_pedido_id:    pedidoId,
    p_nuevo_estado: nuevoEstado,
    p_usuario_id:   sesion.id,
  })

  if (error) return { ok: false, error: error.message }

  redirect(`/pedidos/${pedidoId}`)
}

// ─── Registrar pago ───────────────────────────────────────────────────────────

export type RegistrarPagoResult =
  | { ok: true }
  | { ok: false; error: string }

export async function registrarPagoAction(
  pedidoId: string,
  data: { monto: number; metodo: MetodoPago; fecha: string; notas: string }
): Promise<RegistrarPagoResult> {
  const sesion = await getSesion()
  const supabase = await createClient()

  const { data: pedido } = await supabase
    .from('vista_pedidos_asesor')
    .select('estado, total, total_pagado, sede_id')
    .eq('id', pedidoId)
    .single()

  if (!pedido) return { ok: false, error: 'Pedido no encontrado' }
  if (!puedeAccederSede(sesion, pedido.sede_id)) return { ok: false, error: 'Sin acceso a este pedido' }
  if (pedido.estado === 'cancelado') return { ok: false, error: 'No se pueden registrar pagos en pedidos cancelados' }

  const saldo = pedido.total - pedido.total_pagado
  if (data.monto <= 0) return { ok: false, error: 'El monto debe ser mayor a cero' }
  if (data.monto > saldo) {
    return { ok: false, error: `El monto supera el saldo pendiente (${saldo.toLocaleString('es-CO')} COP)` }
  }

  const { error } = await supabase.from('pagos').insert({
    pedido_id: pedidoId,
    monto:     data.monto,
    metodo:    data.metodo,
    fecha:     data.fecha,
    notas:     data.notas || null,
    asesor_id: sesion.id,
  })

  if (error) return { ok: false, error: error.message }

  redirect(`/pedidos/${pedidoId}`)
}

// ─── Editar pedido ────────────────────────────────────────────────────────────
// Solo campos operacionales (notas, entrega). Los items y el total son inmutables.

export type EditarPedidoResult =
  | { ok: true }
  | { ok: false; error: string }

export async function editarPedidoAction(
  pedidoId: string,
  data: {
    notas: string
    tipo_entrega: 'sede' | 'domicilio'
    direccion_entrega: string
    numero_guia: string
  }
): Promise<EditarPedidoResult> {
  const sesion = await getSesion()
  const supabase = await createClient()

  const { data: pedidoCheck } = await supabase
    .from('vista_pedidos_asesor')
    .select('sede_id, estado')
    .eq('id', pedidoId)
    .single()

  if (!pedidoCheck) return { ok: false, error: 'Pedido no encontrado' }
  if (!puedeAccederSede(sesion, pedidoCheck.sede_id)) return { ok: false, error: 'Sin acceso a este pedido' }
  if (pedidoCheck.estado === 'cancelado') return { ok: false, error: 'No se puede editar un pedido cancelado' }

  if (data.tipo_entrega === 'domicilio' && !data.direccion_entrega.trim()) {
    return { ok: false, error: 'La dirección de entrega es obligatoria para domicilio' }
  }

  const { error: updateError } = await supabase
    .from('pedidos')
    .update({
      notas:             data.notas.trim() || null,
      tipo_entrega:      data.tipo_entrega,
      direccion_entrega: data.tipo_entrega === 'domicilio' ? data.direccion_entrega.trim() : null,
      numero_guia:       data.numero_guia.trim() || null,
    })
    .eq('id', pedidoId)

  if (updateError) return { ok: false, error: updateError.message }

  redirect(`/pedidos/${pedidoId}`)
}
