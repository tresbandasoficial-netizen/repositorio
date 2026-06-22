'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'
import { Articulo, CategoriaArticulo, SexoArticulo } from '@/types'

async function soloAdmin() {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') redirect('/dashboard')
  return sesion
}

export type CrearArticuloInput = {
  codigo: string
  nombre: string        // nombre para mostrar (ej. "Vomero 5 White/Black")
  marca: string
  referencia: string    // código del proveedor (ej. "DV2233-101"), opcional
  color: string
  sexo: SexoArticulo | ''
  categoria: CategoriaArticulo | ''
  descripcion: string
}

export type ArticuloResult =
  | { ok: true; articuloId: string }
  | { ok: false; error: string }

export async function crearArticuloAction(data: CrearArticuloInput): Promise<ArticuloResult> {
  await soloAdmin()
  const supabase = await createClient()

  const nombre = data.nombre.trim()
  const marca  = data.marca.trim()
  const codigo = data.codigo.trim() || null

  if (!nombre || !marca) return { ok: false, error: 'Marca y nombre son obligatorios' }

  // Si enviaron código, intentar encontrar por código primero.
  if (codigo) {
    const { data: existente } = await supabase
      .from('articulos')
      .select('id')
      .ilike('codigo', codigo)
      .maybeSingle()
    if (existente) return { ok: true as const, articuloId: existente.id }
  }

  const { data: articulo, error } = await supabase
    .from('articulos')
    .insert({
      codigo,
      nombre,
      marca,
      referencia:  data.referencia.trim() || null,
      color:       data.color.trim() || null,
      sexo:        data.sexo || null,
      categoria:   data.categoria || null,
      descripcion: data.descripcion.trim() || null,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      // Ya existe con misma marca+nombre+color+sexo.
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

// Busca un artículo por código SKU (para auto-completar al crear pedidos).
export async function buscarPorCodigoAction(codigo: string): Promise<Articulo | null> {
  if (!codigo.trim()) return null
  const supabase = await createClient()
  const { data } = await supabase
    .from('articulos')
    .select('*')
    .ilike('codigo', codigo.trim())
    .eq('activo', true)
    .maybeSingle()
  return data as Articulo | null
}

export type EntradaInput = {
  articulo_id: string
  talla: string         // talla de este lote
  cantidad: number
  costo_unitario_cop: number
  sede_id: string | null
  notas: string
}

export type SimpleResult = { ok: true } | { ok: false; error: string }

export async function registrarEntradaAction(data: EntradaInput): Promise<SimpleResult> {
  const sesion = await soloAdmin()
  const supabase = await createClient()

  if (data.cantidad <= 0) return { ok: false, error: 'La cantidad debe ser mayor a cero' }
  if (data.costo_unitario_cop < 0) return { ok: false, error: 'El costo no puede ser negativo' }
  if (!data.talla.trim()) return { ok: false, error: 'La talla es obligatoria' }

  const { error } = await supabase.rpc('registrar_entrada_inventario', {
    p_articulo_id:    data.articulo_id,
    p_talla:          data.talla.trim(),
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
  talla: string
  sede_origen: string | null
  sede_destino: string | null
  cantidad: number
  notas: string
}

export async function transferirStockAction(data: TransferirInput): Promise<SimpleResult> {
  const sesion = await soloAdmin()
  const supabase = await createClient()

  if (data.cantidad <= 0) return { ok: false, error: 'La cantidad debe ser mayor a cero' }
  if (!data.talla.trim()) return { ok: false, error: 'La talla es obligatoria' }
  if (data.sede_origen === data.sede_destino) {
    return { ok: false, error: 'El origen y el destino no pueden ser iguales' }
  }

  const { error } = await supabase.rpc('transferir_stock', {
    p_articulo_id:  data.articulo_id,
    p_talla:        data.talla.trim(),
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
  talla: string
  sede_id: string | null
  delta: number
  notas: string
}

export async function ajustarStockAction(data: AjusteInput): Promise<SimpleResult> {
  const sesion = await soloAdmin()
  const supabase = await createClient()

  if (data.delta === 0) return { ok: false, error: 'El ajuste no puede ser cero' }
  if (!data.notas.trim()) return { ok: false, error: 'El ajuste requiere una nota que lo justifique' }

  const { error } = await supabase.from('movimientos_inventario').insert({
    articulo_id: data.articulo_id,
    talla:       data.talla.trim() || null,
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

// Búsqueda de artículos para selectores (venta inmediata, compras).
export type ArticuloBusqueda = {
  id: string
  codigo: string | null
  nombre: string
  marca: string
  color: string | null
  sexo: string | null
  tallaStock: { talla: string | null; stock: number }[]
}

export async function buscarArticulosAction(q: string, sedeId: string | null): Promise<ArticuloBusqueda[]> {
  const supabase = await createClient()
  const t = q.trim()
  if (!t) return []

  const { data: articulos } = await supabase
    .from('articulos')
    .select('id, codigo, nombre, marca, color, sexo')
    .eq('activo', true)
    .or(`nombre.ilike.%${t}%,marca.ilike.%${t}%,codigo.ilike.%${t}%,referencia.ilike.%${t}%,color.ilike.%${t}%`)
    .limit(15)

  let lista = (articulos ?? []) as Array<{ id: string; codigo: string | null; nombre: string; marca: string; color: string | null; sexo: string | null }>

  // Fallback: buscar en pedido_items.codigo para artículos guardados sin código
  if (lista.length === 0) {
    const { data: items } = await supabase
      .from('pedido_items')
      .select('articulo_id, codigo')
      .ilike('codigo', `%${t}%`)
      .not('articulo_id', 'is', null)
      .limit(15)

    const articuloIds = [...new Set((items ?? []).map((i: { articulo_id: string; codigo: string | null }) => i.articulo_id).filter(Boolean))]
    const codigoPorArticulo = new Map((items ?? []).map((i: { articulo_id: string; codigo: string | null }) => [i.articulo_id, i.codigo]))

    if (articuloIds.length > 0) {
      const { data: porItems } = await supabase
        .from('articulos')
        .select('id, codigo, nombre, marca, color, sexo')
        .in('id', articuloIds)
        .eq('activo', true)

      // Rellenar codigo desde pedido_items si el artículo no lo tiene, y persistirlo
      const encontrados = (porItems ?? []) as typeof lista
      for (const a of encontrados) {
        if (!a.codigo && codigoPorArticulo.get(a.id)) {
          const codigoHistorico = codigoPorArticulo.get(a.id)!
          a.codigo = codigoHistorico
          // Actualizar en DB para que futuras búsquedas funcionen directo
          supabase.from('articulos').update({ codigo: codigoHistorico }).eq('id', a.id).is('codigo', null).then(() => {})
        }
      }
      lista = encontrados
    }
  }

  if (lista.length === 0) return []

  const ids = lista.map(a => a.id)
  const { data: stock } = await supabase
    .from('vista_stock_por_sede')
    .select('articulo_id, talla, sede_id, stock')
    .in('articulo_id', ids)

  // Agrupar stock por articulo_id → [{ talla, stock }]
  const stockMap = new Map<string, { talla: string | null; stock: number }[]>()
  for (const s of (stock ?? []) as Array<{ articulo_id: string; talla: string | null; sede_id: string | null; stock: number }>) {
    if (!sedeId || s.sede_id === sedeId) {
      const actual = stockMap.get(s.articulo_id) ?? []
      const tallaEntry = actual.find(e => e.talla === s.talla)
      if (tallaEntry) {
        tallaEntry.stock += s.stock
      } else {
        actual.push({ talla: s.talla, stock: s.stock })
      }
      stockMap.set(s.articulo_id, actual)
    }
  }

  return lista.map(a => ({
    ...a,
    tallaStock: (stockMap.get(a.id) ?? []).sort((a, b) => (a.talla ?? '').localeCompare(b.talla ?? '')),
  }))
}
