'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'
import { CategoriaArticulo } from '@/types'

async function soloAdmin() {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') redirect('/dashboard')
  return sesion
}

export type CrearArticuloInput = {
  nombre: string
  marca: string
  talla: string
  categoria: CategoriaArticulo | ''
}

export type ArticuloResult =
  | { ok: true; articuloId: string }
  | { ok: false; error: string }

// Crea un artículo de catálogo. Si ya existe (marca+nombre+talla), lo reutiliza.
export async function crearArticuloAction(data: CrearArticuloInput): Promise<ArticuloResult> {
  await soloAdmin()
  const supabase = await createClient()

  const nombre = data.nombre.trim()
  const marca = data.marca.trim()
  const talla = data.talla.trim() || null
  if (!nombre || !marca) return { ok: false, error: 'Marca y nombre son obligatorios' }

  const { data: articulo, error } = await supabase
    .from('articulos')
    .insert({
      nombre,
      marca,
      talla,
      categoria: data.categoria || null,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      // Ya existe: devolver el existente.
      const { data: existente } = await supabase
        .from('articulos')
        .select('id')
        .ilike('marca', marca)
        .ilike('nombre', nombre)
        .maybeSingle()
      if (existente) return { ok: true as const, articuloId: existente.id }
    }
    return { ok: false, error: error.message }
  }

  revalidatePath('/inventario')
  return { ok: true as const, articuloId: articulo.id }
}

export type EntradaInput = {
  articulo_id: string
  cantidad: number
  costo_unitario_cop: number
  sede_id: string | null  // null = central
  notas: string
}

export type SimpleResult = { ok: true } | { ok: false; error: string }

// Registra una entrada manual de inventario (compras directas / ajuste de stock inicial).
export async function registrarEntradaAction(data: EntradaInput): Promise<SimpleResult> {
  const sesion = await soloAdmin()
  const supabase = await createClient()

  if (data.cantidad <= 0) return { ok: false, error: 'La cantidad debe ser mayor a cero' }
  if (data.costo_unitario_cop < 0) return { ok: false, error: 'El costo no puede ser negativo' }

  const { error } = await supabase.rpc('registrar_entrada_inventario', {
    p_articulo_id:    data.articulo_id,
    p_cantidad:       data.cantidad,
    p_costo_unitario: data.costo_unitario_cop,
    p_usuario_id:     sesion.id,
    p_compra_item_id: null,
    p_sede_id:        data.sede_id,
    p_notas:          data.notas.trim() || null,
  })

  if (error) return { ok: false, error: error.message }
  revalidatePath('/inventario')
  return { ok: true }
}

export type TransferirInput = {
  articulo_id: string
  sede_origen: string | null   // null = central
  sede_destino: string | null  // null = central
  cantidad: number
  notas: string
}

export async function transferirStockAction(data: TransferirInput): Promise<SimpleResult> {
  const sesion = await soloAdmin()
  const supabase = await createClient()

  if (data.cantidad <= 0) return { ok: false, error: 'La cantidad debe ser mayor a cero' }
  if (data.sede_origen === data.sede_destino) {
    return { ok: false, error: 'El origen y el destino no pueden ser iguales' }
  }

  const { error } = await supabase.rpc('transferir_stock', {
    p_articulo_id:  data.articulo_id,
    p_sede_origen:  data.sede_origen,
    p_sede_destino: data.sede_destino,
    p_cantidad:     data.cantidad,
    p_usuario_id:   sesion.id,
    p_notas:        data.notas.trim() || null,
  })

  if (error) return { ok: false, error: error.message }
  revalidatePath('/inventario')
  return { ok: true }
}

export type AjusteInput = {
  articulo_id: string
  sede_id: string | null
  delta: number   // puede ser negativo
  notas: string
}

// Ajuste manual de stock (corrección de inventario). Solo admin.
export async function ajustarStockAction(data: AjusteInput): Promise<SimpleResult> {
  const sesion = await soloAdmin()
  const supabase = await createClient()

  if (data.delta === 0) return { ok: false, error: 'El ajuste no puede ser cero' }
  if (!data.notas.trim()) return { ok: false, error: 'El ajuste requiere una nota que lo justifique' }

  const { error } = await supabase.from('movimientos_inventario').insert({
    articulo_id: data.articulo_id,
    sede_id:     data.sede_id,
    delta:       data.delta,
    tipo:        'ajuste',
    usuario_id:  sesion.id,
    notas:       data.notas.trim(),
  })

  if (error) return { ok: false, error: error.message }
  revalidatePath('/inventario')
  return { ok: true }
}

// Búsqueda de artículos para selectores (venta inmediata, asignación de compras).
export type ArticuloBusqueda = {
  id: string
  nombre: string
  marca: string
  talla: string | null
  stock_sede: number
}

export async function buscarArticulosAction(q: string, sedeId: string | null): Promise<ArticuloBusqueda[]> {
  const supabase = await createClient()
  const t = q.trim()
  if (!t) return []

  const { data: articulos } = await supabase
    .from('articulos')
    .select('id, nombre, marca, talla')
    .eq('activo', true)
    .or(`nombre.ilike.%${t}%,marca.ilike.%${t}%`)
    .limit(15)

  const lista = (articulos ?? []) as Array<{ id: string; nombre: string; marca: string; talla: string | null }>
  if (lista.length === 0) return []

  // Stock de la sede para cada artículo encontrado.
  const ids = lista.map(a => a.id)
  const { data: stock } = await supabase
    .from('vista_stock_por_sede')
    .select('articulo_id, sede_id, stock')
    .in('articulo_id', ids)

  const stockSede = new Map<string, number>()
  for (const s of (stock ?? []) as Array<{ articulo_id: string; sede_id: string | null; stock: number }>) {
    if (sedeId && s.sede_id === sedeId) {
      stockSede.set(s.articulo_id, (stockSede.get(s.articulo_id) ?? 0) + s.stock)
    }
  }

  return lista.map(a => ({ ...a, stock_sede: stockSede.get(a.id) ?? 0 }))
}
