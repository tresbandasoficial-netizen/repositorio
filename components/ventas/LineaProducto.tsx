'use client'

import { useState, useEffect } from 'react'
import { buscarArticulosAction, guardarArticuloCatalogoAction, guardarNombreArticuloAction, ArticuloBusqueda } from '@/app/actions/articulos'
import { ItemVenta } from '@/app/actions/ventas'
import { TallaSelect } from '@/components/ui/TallaSelect'
import { MarcaSelect } from '@/components/ui/MarcaSelect'
import { useAviso } from '@/components/ui/Aviso'
import type { CategoriaArticulo } from '@/types'
import { formatMiles } from '@/lib/utils/format'

export type Linea = ItemVenta & { key: number; codigo?: string }

let _k = 0
export const nuevaLinea = (): Linea => ({
  key: _k++,
  articulo_id: null,
  codigo: '',
  marca: '',
  descripcion: '',
  talla: '',
  cantidad: 1,
  precio_venta: 0,
  color: '',
  sexo: '',
  categoria: '',
})

// Una opción por ARTÍCULO, no por artículo+talla: la talla la elige la persona
// después. Las tallas viajan solo como información de qué hay en existencia.
type OpcionCatalogo = {
  articulo_id: string
  codigo: string | null
  marca: string
  nombre: string
  color: string | null
  sexo: string | null
  categoria: string | null
  tallas: Array<{ talla: string | null; stock: number }>
}

function aOpciones(articulos: ArticuloBusqueda[]): OpcionCatalogo[] {
  return articulos.map(a => ({
    articulo_id: a.id,
    codigo: a.codigo,
    marca: a.marca,
    nombre: a.nombre,
    color: a.color,
    sexo: a.sexo,
    categoria: a.categoria,
    tallas: a.tallaStock.map(ts => ({ talla: ts.talla, stock: ts.stock })),
  }))
}

export function LineaProducto({
  linea, sedeId, sedeCodigo, onChange, onRemove, numero,
}: {
  linea: Linea
  sedeId: string
  sedeCodigo: string
  onChange: (patch: Partial<Linea>) => void
  onRemove?: () => void
  numero?: number
}) {
  const [opciones, setOpciones]         = useState<OpcionCatalogo[]>([])
  const [abierto, setAbierto]           = useState(false)
  const [noEncontrado, setNoEncontrado] = useState(false)
  const [guardando, setGuardando]       = useState(false)
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null)
  const [descripcionGuardada, setDescripcionGuardada] = useState<boolean>(false)
  const [guardandoDescripcion, setGuardandoDescripcion] = useState(false)
  const [avisoRenombrado, setAvisoRenombrado] = useState<string | null>(null)
  const [errorNombre, setErrorNombre] = useState<string | null>(null)
  // Tallas en existencia del artículo elegido, para avisar del stock cuando la
  // persona escoja la talla (antes el stock venía pegado a la opción elegida).
  const [tallasArticulo, setTallasArticulo] = useState<Array<{ talla: string | null; stock: number }> | null>(null)
  const { avisar, avisarError } = useAviso()

  useEffect(() => {
    if (linea.articulo_id) { setOpciones([]); setAbierto(false); setNoEncontrado(false); return }
    setNoEncontrado(false)
    setErrorGuardar(null)
    const q = linea.codigo?.trim() ?? ''
    const t = setTimeout(async () => {
      if (q.length < 2) { setOpciones([]); setAbierto(false); return }
      const articulos = await buscarArticulosAction(q, sedeId)
      const ops = aOpciones(articulos)
      setOpciones(ops)
      setAbierto(ops.length > 0)
      setNoEncontrado(ops.length === 0)
    }, 250)
    return () => clearTimeout(t)
  }, [linea.codigo, sedeId, linea.articulo_id])

  // Stock de la talla que se haya elegido. null = todavía sin talla, o el
  // artículo no tiene existencias registradas de esa talla.
  const stockTalla = (() => {
    if (!linea.articulo_id || !tallasArticulo || !linea.talla?.trim()) return null
    const t = linea.talla.trim().toLowerCase()
    const encontrada = tallasArticulo.find(x => (x.talla ?? '').trim().toLowerCase() === t)
    return encontrada ? encontrada.stock : 0
  })()

  function elegir(item: OpcionCatalogo) {
    // La talla NO se llena al elegir el artículo: la escoge la persona. Antes se
    // heredaba de la opción del listado y quedaba una talla que nadie eligió.
    onChange({
      articulo_id: item.articulo_id,
      codigo:      item.codigo ?? linea.codigo,
      marca:       item.marca,
      descripcion: item.nombre,
      color:       item.color ?? linea.color,
      sexo:        (item.sexo ?? linea.sexo) as any,
      categoria:   (item.categoria ?? linea.categoria) as any,
    })
    setTallasArticulo(item.tallas)
    setAbierto(false)
    setNoEncontrado(false)
  }

  async function guardarEnCatalogo() {
    const codigo = linea.codigo?.trim()
    if (!codigo || !linea.descripcion.trim() || !linea.marca.trim()) return
    setGuardando(true)
    setErrorGuardar(null)
    const result = await guardarArticuloCatalogoAction({
      codigo,
      nombre:      linea.descripcion.trim(),
      marca:       linea.marca.trim(),
      referencia:  '',
      color:       linea.color?.trim() ?? '',
      sexo:        (linea.sexo ?? '') as any,
      categoria:   (linea.categoria ?? '') as any,
      descripcion: '',
    })
    setGuardando(false)
    if (result.ok) {
      onChange({ articulo_id: result.articuloId })
      setNoEncontrado(false)
    } else {
      setErrorGuardar(result.error)
    }
  }

  async function guardarDescripcion() {
    if (!linea.codigo?.trim() || !linea.descripcion.trim() || !linea.marca.trim()) return
    setGuardandoDescripcion(true)
    setDescripcionGuardada(false)
    setAvisoRenombrado(null)
    setErrorNombre(null)

    const result = await guardarNombreArticuloAction({
      codigo: linea.codigo.trim(),
      nombre: linea.descripcion.trim(),
      marca: linea.marca.trim(),
      referencia: '',
      color: linea.color?.trim() ?? '',
      sexo: (linea.sexo ?? '') as any,
      categoria: (linea.categoria ?? '') as any,
      descripcion: '',
    })

    setGuardandoDescripcion(false)
    if (result.ok) {
      setDescripcionGuardada(true)
      onChange({ articulo_id: result.articuloId })
      // Renombrar toca el catálogo, así que se avisa: el nombre nuevo va a
      // salir en todo lo que use ese código, no solo en esta línea.
      if (result.renombrado) {
        setAvisoRenombrado(result.nombreAnterior ?? null)
        avisar('Cambio realizado')
      }
      setTimeout(() => setDescripcionGuardada(false), 2000)
    } else {
      setErrorNombre(result.error)
      avisarError(result.error)
    }
  }

  const puedeGuardar = !!(
    linea.descripcion.trim() && linea.marca.trim() && linea.categoria &&
    (linea.categoria === 'accesorios' || linea.sexo)
  )

  return (
    <div className="border border-gray-200 rounded-xl p-3 space-y-2 bg-gray-50/40">
      {/* Encabezado: número del producto + quitar */}
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-600 uppercase tracking-wide">
          <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px] font-bold normal-case">
            {numero ?? '•'}
          </span>
          Producto {numero ?? ''}
        </span>
        {onRemove && (
          <button type="button" onClick={onRemove} className="text-xs text-red-500 hover:text-red-700" title="Quitar producto">
            ✕ Quitar
          </button>
        )}
      </div>

      {stockTalla != null && stockTalla <= 0 && (
        <p className="text-xs text-amber-600">
          ⚠ Sin stock de la talla {linea.talla} en {sedeCodigo}. Dejará el inventario en negativo.
        </p>
      )}
      {stockTalla != null && stockTalla > 0 && (
        <p className="text-xs text-green-600">
          ✓ {stockTalla} en existencia de la talla {linea.talla} en {sedeCodigo}
        </p>
      )}

      {/* Fila 1: Código (buscador) · Nombre del producto */}
      <div className="grid grid-cols-[1fr_2fr] gap-2">
        <div className="relative">
          <input
            type="text"
            value={linea.codigo || ''}
            onChange={e => {
              // Al cambiar el código se pierde el artículo elegido y sus tallas.
              onChange({ codigo: e.target.value, articulo_id: null })
              setTallasArticulo(null)
            }}
            onBlur={() => setTimeout(() => setAbierto(false), 150)}
            placeholder="Código"
            className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {abierto && opciones.length > 0 && (
            <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-56 overflow-y-auto">
              {opciones.map(item => {
                const conStock = item.tallas.filter(t => t.stock > 0)
                return (
                  <button
                    key={item.articulo_id}
                    type="button"
                    onMouseDown={() => elegir(item)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b border-gray-50 last:border-0"
                  >
                    <span className="block">
                      {item.codigo && <span className="font-mono text-gray-400 text-xs mr-1">{item.codigo}</span>}
                      <span className="font-medium text-gray-900">{item.marca} {item.nombre}</span>
                      {item.color && <span className="text-gray-400"> · {item.color}</span>}
                    </span>
                    {/* Las tallas son informativas: al elegir no se llena ninguna. */}
                    <span className="block text-xs mt-0.5">
                      {conStock.length > 0 ? (
                        <>
                          <span className="text-gray-400">En {sedeCodigo}: </span>
                          {conStock.map(t => (
                            <span key={t.talla ?? ''} className="text-green-700 mr-1.5">
                              {t.talla ? `T${t.talla}` : 'sin talla'}·{t.stock}
                            </span>
                          ))}
                        </>
                      ) : (
                        <span className="text-red-500">Sin existencias en {sedeCodigo}</span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div className="relative">
          <input
            type="text"
            value={linea.descripcion}
            onChange={e => onChange({ descripcion: e.target.value })}
            onBlur={guardarDescripcion}
            placeholder="Nombre del producto"
            className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {guardandoDescripcion && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-500 text-sm animate-spin">⏳</div>
          )}
          {descripcionGuardada && !guardandoDescripcion && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 text-green-600 font-bold text-sm">✓</div>
          )}
        </div>
      </div>

      {errorNombre && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
          No se pudo guardar el nombre: {errorNombre}
        </p>
      )}

      {avisoRenombrado && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
          En el catálogo este código se llamaba <strong>{avisoRenombrado}</strong> — se renombró a{' '}
          <strong>{linea.descripcion}</strong>, así que ese nombre sale ahora en todas las pantallas.
          <button
            type="button"
            onClick={() => setAvisoRenombrado(null)}
            className="ml-2 underline hover:no-underline"
          >
            Entendido
          </button>
        </p>
      )}

      {/* No encontrado → botón Guardar */}
      {noEncontrado && !linea.articulo_id && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={guardarEnCatalogo}
            disabled={guardando || !puedeGuardar}
            className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg px-2.5 py-1 hover:bg-green-100 disabled:opacity-40 transition-colors"
          >
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
          {!puedeGuardar && <span className="text-xs text-gray-400">Completa nombre, marca, categoría y hombre/mujer primero</span>}
          {errorGuardar && <span className="text-xs text-red-600">{errorGuardar}</span>}
        </div>
      )}

      {/* Enlazado */}
      {linea.articulo_id && (
        <p className="text-xs text-green-600 font-medium">✓ Enlazado al catálogo</p>
      )}

      {/* Fila 2: Marca · Talla · Cant */}
      <div className="grid grid-cols-[2fr_1fr_auto] gap-2 items-center">
        <MarcaSelect
          value={linea.marca}
          onChange={marca => onChange({ marca })}
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
        <TallaSelect
          categoria={linea.categoria as CategoriaArticulo | ''}
          sexo={linea.sexo as any}
          value={linea.talla}
          onChange={talla => onChange({ talla })}
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
        <input
          type="number"
          min={1}
          value={linea.cantidad}
          onChange={e => onChange({ cantidad: Math.max(1, parseInt(e.target.value) || 1) })}
          className="w-16 rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Fila 3: Color · Sexo · Categoría */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          value={linea.color || ''}
          onChange={e => onChange({ color: e.target.value })}
          placeholder="Color"
          className="w-28 rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex gap-1">
          {(['hombre', 'mujer', 'nino'] as const).map(s => (
            <button key={s} type="button" onClick={() => onChange({ sexo: linea.sexo === s ? '' : s })}
              className={`text-xs px-2 py-1.5 rounded border font-medium transition-colors ${
                linea.sexo === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}>
              {s === 'nino' ? 'Niño' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {(['ropa', 'tenis', 'accesorios'] as const).map(c => (
            <button key={c} type="button" onClick={() => onChange({ categoria: linea.categoria === c ? '' : c })}
              className={`text-xs px-2 py-1.5 rounded border font-medium transition-colors ${
                linea.categoria === c ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}>
              {c === 'accesorios' ? 'Accesorios' : c.charAt(0).toUpperCase() + c.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Fila 4: Precio */}
      <input
        type="text"
        inputMode="numeric"
        value={formatMiles(linea.precio_venta || '')}
        onChange={e => onChange({ precio_venta: parseInt(e.target.value.replace(/\D/g, '')) || 0 })}
        placeholder="Precio de venta"
        className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )
}
