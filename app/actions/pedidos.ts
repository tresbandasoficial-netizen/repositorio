'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parsearPedido } from '@/lib/parser'
import { normalizarTelefono } from '@/lib/utils/phone'
import { getSiguienteNumeroOrden } from '@/lib/queries/pedidos'
import { puedeTransicionar } from '@/lib/domain/estados'
import { EstadoPedido, MetodoPago, ParsedPedido } from '@/types'
import { getSesion, puedeAccederSede } from '@/lib/auth/acceso'

export type CrearPedidoResult =
  | { ok: true; pedidoId: string }
  | { ok: false; error: string; siguienteNumero?: string }

// Lógica compartida: crea el pedido desde datos ya parseados/editados
async function _crearPedidoConDatos(
  datos: ParsedPedido,
  numeroOrdenManual: string
): Promise<CrearPedidoResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id, nombre, sede_id, sedes(id, codigo)')
    .eq('id', user.id)
    .single()
  if (!usuario) return { ok: false, error: 'Usuario no encontrado' }

  const { data: sede } = await supabase
    .from('sedes')
    .select('id, codigo')
    .eq('codigo', datos.sede)
    .single()
  if (!sede) return { ok: false, error: `Sede "${datos.sede}" no encontrada en la base de datos` }

  const numeroOrden = numeroOrdenManual.trim().toUpperCase()
  if (!numeroOrden) return { ok: false, error: 'El número de orden es obligatorio' }
  if (!numeroOrden.startsWith(datos.sede)) {
    return { ok: false, error: `El número de orden debe empezar con "${datos.sede}" (sede del pedido)` }
  }

  const telefonoNormalizado = normalizarTelefono(datos.cliente_telefono)
  if (!telefonoNormalizado) return { ok: false, error: 'Teléfono del cliente inválido' }

  const { data: clienteExistente } = await supabase
    .from('clientes')
    .select('id, nombre, cedula')
    .eq('telefono_normalizado', telefonoNormalizado)
    .single()

  let clienteId: string

  if (clienteExistente) {
    clienteId = clienteExistente.id
    if (datos.cliente_doc && !clienteExistente.cedula) {
      const cedulaLimpia = datos.cliente_doc.replace(/^CC\s*/i, '').trim()
      await supabase.from('clientes').update({ cedula: cedulaLimpia }).eq('id', clienteId)
    }
  } else {
    const cedulaLimpia = datos.cliente_doc
      ? datos.cliente_doc.replace(/^CC\s*/i, '').trim()
      : null
    const { data: nuevoCliente, error: errCliente } = await supabase
      .from('clientes')
      .insert({ telefono_normalizado: telefonoNormalizado, nombre: datos.cliente_nombre.trim(), cedula: cedulaLimpia })
      .select('id')
      .single()
    if (errCliente || !nuevoCliente) return { ok: false, error: `Error creando cliente: ${errCliente?.message}` }
    clienteId = nuevoCliente.id
  }

  const items = datos.productos.map((p) => ({
    marca: p.marca,
    descripcion: p.descripcion,
    talla: p.talla ?? '',
    cantidad: p.cantidad,
    precio_venta: p.precio_venta,
    imagen_url: (p as any).imagen_url ?? null,
  }))
  const total = datos.productos.reduce((s, p) => s + p.precio_venta * p.cantidad, 0)

  const { data: pedidoId, error: errPedido } = await supabase.rpc('crear_pedido', {
    p_numero_orden:     numeroOrden,
    p_sede_id:          sede.id,
    p_asesor_id:        usuario.id,
    p_cliente_id:       clienteId,
    p_total:            total,
    p_tipo_entrega:     datos.tipo_entrega,
    p_direccion_entrega: datos.direccion ?? null,
    p_notas:            datos.notas ?? null,
    p_items:            items,
    p_abono:            datos.abono,
    p_metodo_pago:      datos.metodo_pago_abono,
  })

  if (errPedido) {
    if (errPedido.code === '23505') {
      const siguienteNumero = await getSiguienteNumeroOrden(datos.sede)
      return { ok: false, error: `El número "${numeroOrden}" ya está en uso.`, siguienteNumero }
    }
    return { ok: false, error: `Error creando pedido: ${errPedido.message}` }
  }

  return { ok: true as const, pedidoId }
}

export async function crearPedidoAction(
  textoResumen: string,
  numeroOrdenManual: string
): Promise<CrearPedidoResult> {
  const parseResult = parsearPedido(textoResumen)
  if (!parseResult.ok) return { ok: false, error: parseResult.error }
  return _crearPedidoConDatos(parseResult.data, numeroOrdenManual)
}

export async function crearPedidoDesdeDataAction(
  datos: ParsedPedido,
  numeroOrdenManual: string
): Promise<CrearPedidoResult> {
  return _crearPedidoConDatos(datos, numeroOrdenManual)
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

// Igual que cambiarEstadoAction pero sin redirect (para cambio inline desde la lista)
export async function cambiarEstadoInlineAction(
  pedidoId: string,
  estadoActual: EstadoPedido,
  nuevoEstado: EstadoPedido
): Promise<CambiarEstadoResult> {
  const sesion = await getSesion()
  const supabase = await createClient()

  const { data: pedido } = await supabase
    .from('vista_pedidos_asesor')
    .select('sede_id')
    .eq('id', pedidoId)
    .single()

  if (!pedido || !puedeAccederSede(sesion, pedido.sede_id)) {
    return { ok: false, error: 'Sin acceso a este pedido' }
  }

  if (!puedeTransicionar(estadoActual, nuevoEstado, sesion.rol)) {
    return { ok: false, error: `Transición inválida: ${estadoActual} → ${nuevoEstado}` }
  }

  const { error } = await supabase.rpc('cambiar_estado_pedido', {
    p_pedido_id:    pedidoId,
    p_nuevo_estado: nuevoEstado,
    p_usuario_id:   sesion.id,
  })

  if (error) return { ok: false, error: error.message }
  return { ok: true }
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
    numero_orden: string
    notas: string
    tipo_entrega: 'sede' | 'domicilio'
    direccion_entrega: string
    cliente_nombre: string
    cliente_telefono: string
    cliente_id: string
    productos: Array<{ marca: string; descripcion: string; talla: string; cantidad: number; precio_venta: number; imagen_url?: string | null }>
  }
): Promise<EditarPedidoResult> {
  const sesion = await getSesion()
  const supabase = await createClient()

  const { data: pedidoCheck } = await supabase
    .from('vista_pedidos_asesor')
    .select('sede_id, estado, sede_codigo, notas, tipo_entrega, direccion_entrega, numero_orden')
    .eq('id', pedidoId)
    .single()

  if (!pedidoCheck) return { ok: false, error: 'Pedido no encontrado' }
  if (!puedeAccederSede(sesion, pedidoCheck.sede_id)) return { ok: false, error: 'Sin acceso a este pedido' }
  if (pedidoCheck.estado === 'cancelado') return { ok: false, error: 'No se puede editar un pedido cancelado' }

  const nuevoNumero = data.numero_orden.trim().toUpperCase()
  if (!nuevoNumero) return { ok: false, error: 'El número de pedido es obligatorio' }
  const sedeCodigo = (pedidoCheck as any).sede_codigo as string
  if (!nuevoNumero.startsWith(sedeCodigo)) {
    return { ok: false, error: `El número debe empezar con ${sedeCodigo}` }
  }
  if (data.tipo_entrega === 'domicilio' && !data.direccion_entrega.trim()) {
    return { ok: false, error: 'La dirección de entrega es obligatoria para domicilio' }
  }
  if (!data.cliente_nombre.trim()) return { ok: false, error: 'El nombre del cliente es obligatorio' }
  if (data.productos.length === 0) return { ok: false, error: 'Debe haber al menos un producto' }

  // Actualizar cliente
  const telefonoNormalizado = normalizarTelefono(data.cliente_telefono)
  if (!telefonoNormalizado) return { ok: false, error: 'Teléfono inválido' }
  await supabase
    .from('clientes')
    .update({ nombre: data.cliente_nombre.trim(), telefono_normalizado: telefonoNormalizado })
    .eq('id', data.cliente_id)

  // Calcular nuevo total
  const nuevoTotal = data.productos.reduce((s, p) => s + p.precio_venta * p.cantidad, 0)

  // Actualizar pedido
  const { error: updateError } = await supabase
    .from('pedidos')
    .update({
      numero_orden:      nuevoNumero,
      notas:             data.notas.trim() || null,
      tipo_entrega:      data.tipo_entrega,
      direccion_entrega: data.tipo_entrega === 'domicilio' ? data.direccion_entrega.trim() : null,
      total:             nuevoTotal,
    })
    .eq('id', pedidoId)

  if (updateError) {
    if (updateError.code === '23505') return { ok: false, error: `El número "${nuevoNumero}" ya está en uso.` }
    return { ok: false, error: updateError.message }
  }

  // Reemplazar items (delete + insert) — se usa adminClient porque RLS no tiene policy DELETE
  const adminClient = createAdminClient()
  const { error: deleteError } = await adminClient.from('pedido_items').delete().eq('pedido_id', pedidoId)
  if (deleteError) return { ok: false, error: `Error eliminando productos anteriores: ${deleteError.message}` }
  const { error: itemsError } = await adminClient.from('pedido_items').insert(
    data.productos.map(p => ({
      pedido_id:    pedidoId,
      marca:        p.marca.trim(),
      descripcion:  p.descripcion.trim(),
      talla:        p.talla.trim() || null,
      cantidad:     p.cantidad,
      precio_venta: p.precio_venta,
      imagen_url:   (p as any).imagen_url ?? null,
    }))
  )
  if (itemsError) return { ok: false, error: `Error actualizando productos: ${itemsError.message}` }

  // Registrar cambios en historial
  const previo = pedidoCheck as any
  type CambioEntry = { tabla: string; registro_id: string; campo: string; valor_anterior: string | null; valor_nuevo: string | null; usuario_id: string }
  const cambios: CambioEntry[] = []
  const campos: Array<{ campo: string; anterior: string | null; nuevo: string | null }> = [
    { campo: 'numero_orden',      anterior: previo.numero_orden,      nuevo: nuevoNumero },
    { campo: 'notas',             anterior: previo.notas ?? null,     nuevo: data.notas.trim() || null },
    { campo: 'tipo_entrega',      anterior: previo.tipo_entrega,      nuevo: data.tipo_entrega },
    { campo: 'direccion_entrega', anterior: previo.direccion_entrega ?? null, nuevo: data.tipo_entrega === 'domicilio' ? data.direccion_entrega.trim() : null },
  ]
  for (const { campo, anterior, nuevo } of campos) {
    if (anterior !== nuevo) {
      cambios.push({ tabla: 'pedidos', registro_id: pedidoId, campo, valor_anterior: anterior, valor_nuevo: nuevo, usuario_id: sesion.id })
    }
  }
  if (cambios.length > 0) {
    await adminClient.from('historial_cambios').insert(cambios)
  }

  redirect(`/pedidos/${pedidoId}`)
}

// ─── Eliminar pedido ──────────────────────────────────────────────────────────

export type EliminarPedidoResult =
  | { ok: true }
  | { ok: false; error: string }

export async function eliminarPedidoAction(pedidoId: string): Promise<EliminarPedidoResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (usuario?.rol !== 'admin') return { ok: false, error: 'Solo los administradores pueden eliminar pedidos' }

  const adminClient = createAdminClient()

  const { error } = await adminClient
    .from('pedidos')
    .delete()
    .eq('id', pedidoId)

  if (error) return { ok: false, error: error.message }

  redirect('/pedidos')
}
