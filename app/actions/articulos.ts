'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'
import { terminoBusquedaSeguro } from '@/lib/utils/busqueda'
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
  return _crearArticulo(data)
}

// Permite a cualquier asesor guardar artículos al catálogo desde pedidos/ventas
export async function guardarArticuloCatalogoAction(data: CrearArticuloInput): Promise<ArticuloResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }
  return _crearArticulo(data)
}

async function _crearArticulo(data: CrearArticuloInput): Promise<ArticuloResult> {
  const supabase = await createClient()

  const nombre = data.nombre.trim()
  const marca  = data.marca.trim()
  const codigo = data.codigo.trim() || null

  if (!nombre || !marca) return { ok: false, error: 'Marca y nombre son obligatorios' }
  if (!data.categoria) return { ok: false, error: 'Indica si es ropa, tenis o accesorio' }
  if (data.categoria !== 'accesorios' && !data.sexo) {
    return { ok: false, error: 'Indica si es de hombre, de mujer o de niño' }
  }

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
      // Ya existe (índice único por marca+nombre+color+sexo): reusar el existente.
      // Puede haber varios con la misma marca/nombre (colores distintos), así que
      // se compara también color y sexo.
      const { data: candidatos } = await supabase
        .from('articulos')
        .select('id, color, sexo')
        .ilike('marca', marca)
        .ilike('nombre', nombre)
        .limit(20)
      const colorKey = data.color.trim().toLowerCase()
      const sexoKey  = (data.sexo || '').toLowerCase()
      const existente = (candidatos ?? []).find(a =>
        (a.color ?? '').toLowerCase() === colorKey && (a.sexo ?? '').toLowerCase() === sexoKey
      ) ?? (candidatos ?? [])[0]
      if (existente) return { ok: true as const, articuloId: existente.id }
      return { ok: false, error: 'Ya existe un artículo con esa marca, nombre, color y sexo. Búscalo por código o nombre para usarlo.' }
    }
    return { ok: false, error: error.message }
  }

  revalidatePath('/inventario')
  return { ok: true as const, articuloId: articulo.id }
}

export type EditarArticuloInput = CrearArticuloInput & {
  id: string
  precio_venta: number | null
}

// Edita la ficha de un artículo del catálogo (solo admin, desde /inventario).
export async function editarArticuloAction(data: EditarArticuloInput): Promise<SimpleResult> {
  await soloAdmin()
  const supabase = await createClient()

  const nombre = data.nombre.trim()
  const marca  = data.marca.trim()
  const codigo = data.codigo.trim() || null

  if (!nombre || !marca) return { ok: false, error: 'Marca y nombre son obligatorios' }
  if (!data.categoria) return { ok: false, error: 'Indica si es ropa, tenis o accesorio' }
  if (data.categoria !== 'accesorios' && !data.sexo) {
    return { ok: false, error: 'Indica si es de hombre, de mujer o de niño' }
  }

  // El código identifica el modelo: no puede quedar repetido en otro artículo.
  if (codigo) {
    const { data: otro } = await supabase
      .from('articulos')
      .select('id')
      .ilike('codigo', codigo)
      .neq('id', data.id)
      .maybeSingle()
    if (otro) return { ok: false, error: `Ya hay otro artículo con el código ${codigo}` }
  }

  const { error } = await supabase
    .from('articulos')
    .update({
      codigo,
      nombre,
      marca,
      referencia:   data.referencia.trim() || null,
      color:        data.color.trim() || null,
      sexo:         data.sexo || null,
      categoria:    data.categoria || null,
      descripcion:  data.descripcion.trim() || null,
      precio_venta: data.precio_venta,
    })
    .eq('id', data.id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/inventario')
  return { ok: true }
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

  // La talla es obligatoria salvo para accesorios (no llevan talla).
  const { data: art } = await supabase.from('articulos').select('categoria').eq('id', data.articulo_id).maybeSingle()
  if (art?.categoria !== 'accesorios' && !data.talla.trim()) {
    return { ok: false, error: 'La talla es obligatoria' }
  }

  const { error } = await supabase.rpc('registrar_entrada_inventario', {
    p_articulo_id:    data.articulo_id,
    p_talla:          data.talla.trim() || null,
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
  if (data.sede_origen === data.sede_destino) {
    return { ok: false, error: 'El origen y el destino no pueden ser iguales' }
  }

  // La talla es obligatoria salvo para accesorios (no llevan talla).
  const { data: art } = await supabase.from('articulos').select('categoria').eq('id', data.articulo_id).maybeSingle()
  if (art?.categoria !== 'accesorios' && !data.talla.trim()) {
    return { ok: false, error: 'La talla es obligatoria' }
  }

  const { error } = await supabase.rpc('transferir_stock', {
    p_articulo_id:  data.articulo_id,
    p_talla:        data.talla.trim() || null,
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
  categoria: string | null
  tallaStock: { talla: string | null; stock: number }[]
}

export async function buscarArticulosAction(q: string, sedeId: string | null): Promise<ArticuloBusqueda[]> {
  const supabase = await createClient()
  const t = terminoBusquedaSeguro(q)
  if (!t) return []

  const { data: articulos } = await supabase
    .from('articulos')
    .select('id, codigo, nombre, marca, color, sexo, categoria')
    .eq('activo', true)
    .or(`nombre.ilike.%${t}%,marca.ilike.%${t}%,codigo.ilike.%${t}%,referencia.ilike.%${t}%,color.ilike.%${t}%`)
    .limit(15)

  const lista = (articulos ?? []) as Array<{ id: string; codigo: string | null; nombre: string; marca: string; color: string | null; sexo: string | null; categoria: string | null }>
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
