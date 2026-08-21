'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'

// ─── Autollenado: buscar un artículo por su código exacto ────────────────────

export type ArticuloPorCodigo = {
  id: string
  codigo: string | null
  marca: string
  nombre: string
  categoria: 'ropa' | 'tenis' | 'accesorios' | null
  sexo: 'hombre' | 'mujer' | 'nino' | null
  precio_venta: number | null
  foto: string | null
}

export async function buscarArticuloPorCodigoAction(codigo: string): Promise<ArticuloPorCodigo | null> {
  const supabase = await createClient()
  const cod = codigo.trim()
  if (!cod) return null
  const { data } = await supabase
    .from('articulos')
    .select('id, codigo, marca, nombre, categoria, sexo, precio_venta, fotos')
    .ilike('codigo', cod)
    .eq('activo', true)
    .maybeSingle()
  if (!data) return null
  const { fotos, ...resto } = data as any
  return { ...resto, foto: fotos?.[0] ?? null } as ArticuloPorCodigo
}

// ─── Carga en lote: crear artículos + fijar stock contado ────────────────────

export type FilaLote = {
  codigo: string | null
  marca: string
  nombre: string
  categoria: 'ropa' | 'tenis' | 'accesorios'
  sexo: 'hombre' | 'mujer' | 'nino' | null
  precio_venta: number | null
  talla: string | null
  cantidad: number | null   // null = solo crear el artículo, sin contar stock
  foto_url?: string | null  // foto subida en la planilla → queda en la ficha
}

export type CargaMasivaResult =
  | { ok: true; creados: number; reutilizados: number; ajustes: number; errores: string[] }
  | { ok: false; error: string }

// Procesa la planilla: crea los artículos que falten (reutiliza por código),
// actualiza el precio de venta si viene, y registra el conteo de stock de la
// sede en un solo paso (el stock queda fijado en lo digitado).
export async function cargaMasivaAction(
  sedeId: string,
  filas: FilaLote[]
): Promise<CargaMasivaResult> {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') return { ok: false, error: 'Sin permisos' }
  if (filas.length === 0) return { ok: false, error: 'La planilla está vacía' }
  if (filas.length > 500) return { ok: false, error: 'Máximo 500 filas por carga' }
  const supabase = await createClient()

  let creados = 0
  let reutilizados = 0
  const errores: string[] = []
  // Clave articulo+talla → cantidad (si se repite la misma fila, se suma)
  const conteo = new Map<string, { articulo_id: string; talla: string | null; cantidad: number }>()
  // Cache de códigos ya resueltos en esta carga (varias tallas del mismo producto)
  const porCodigo = new Map<string, string>()
  // Artículos a los que ya se les puso foto en esta carga (no repetir el update)
  const fotoPuesta = new Set<string>()

  // La foto de la planilla queda en la ficha SOLO si la ficha no tiene fotos
  // (no se pisa una foto existente).
  async function ponerFotoSiFalta(articuloId: string, fotoUrl: string | null | undefined) {
    if (!fotoUrl || fotoPuesta.has(articuloId)) return
    fotoPuesta.add(articuloId)
    const { data } = await supabase.from('articulos').select('fotos').eq('id', articuloId).maybeSingle()
    if (data && (!data.fotos || (data.fotos as string[]).length === 0)) {
      await supabase.from('articulos').update({ fotos: [fotoUrl] }).eq('id', articuloId)
    }
  }

  for (let i = 0; i < filas.length; i++) {
    const f = filas[i]
    const linea = i + 1
    try {
      const codigo = f.codigo?.trim().toUpperCase() || null
      const marca = f.marca.trim()
      const nombre = f.nombre.trim()

      // 1. Resolver el artículo
      let articuloId: string | null = null
      if (codigo && porCodigo.has(codigo)) {
        articuloId = porCodigo.get(codigo)!
        await ponerFotoSiFalta(articuloId, f.foto_url)
      } else if (codigo) {
        const { data } = await supabase.from('articulos').select('id, precio_venta').ilike('codigo', codigo).maybeSingle()
        if (data) {
          articuloId = data.id
          reutilizados++
          // Actualizar el precio si lo digitaron y cambió
          if (f.precio_venta !== null && f.precio_venta !== (data as any).precio_venta) {
            await supabase.from('articulos').update({ precio_venta: f.precio_venta }).eq('id', data.id)
          }
          await ponerFotoSiFalta(data.id, f.foto_url)
        }
      }

      // 2. Crearlo si no existe
      if (!articuloId) {
        if (!marca || !nombre) { errores.push(`Fila ${linea}: para crear un artículo nuevo, marca y nombre son obligatorios`); continue }
        if (!f.categoria) { errores.push(`Fila ${linea} (${marca} ${nombre}): falta la categoría`); continue }
        if (f.categoria !== 'accesorios' && !f.sexo) { errores.push(`Fila ${linea} (${marca} ${nombre}): falta el sexo`); continue }
        const { data: nuevo, error } = await supabase
          .from('articulos')
          .insert({
            codigo,
            marca,
            nombre,
            sexo: f.categoria === 'accesorios' ? null : f.sexo,
            categoria: f.categoria,
            precio_venta: f.precio_venta,
            fotos: f.foto_url ? [f.foto_url] : null,
            activo: true,
          })
          .select('id')
          .single()
        if (error || !nuevo) {
          errores.push(`Fila ${linea} (${marca} ${nombre}): ${error?.message ?? 'no se pudo crear'}`)
          continue
        }
        articuloId = nuevo.id
        creados++
      }
      if (codigo && articuloId) porCodigo.set(codigo, articuloId)

      // 3. Si trae cantidad, va al conteo de stock (misma talla repetida: se suma)
      if (f.cantidad !== null && f.cantidad >= 0 && articuloId) {
        const talla = f.talla?.trim() || null
        const key = `${articuloId}|${talla ?? ''}`
        const prev = conteo.get(key)
        if (prev) prev.cantidad += f.cantidad
        else conteo.set(key, { articulo_id: articuloId, talla, cantidad: f.cantidad })
      }
    } catch (e: any) {
      errores.push(`Fila ${linea}: ${e?.message ?? 'error inesperado'}`)
    }
  }

  // 4. Registrar el conteo (fija el stock; el RPC valida rol y sede)
  let ajustes = 0
  const items = Array.from(conteo.values())
  if (items.length > 0) {
    const { data, error } = await supabase.rpc('registrar_conteo_inventario', {
      p_sede_id:    sedeId,
      p_items:      items,
      p_usuario_id: sesion.id,
    })
    if (error) return { ok: false, error: `Artículos procesados, pero falló la carga del stock: ${error.message}` }
    ajustes = (data as number) ?? 0
  }

  revalidatePath('/inventario')
  return { ok: true, creados, reutilizados, ajustes, errores }
}
