'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { parsearPedido } from '@/lib/parser'
import { ParsedPedido } from '@/types'
import { editarPedidoAction } from '@/app/actions/pedidos'
import { formatCOP } from '@/lib/utils/format'
import { ImagenProducto } from '@/components/pedidos/ImagenProducto'
import { uploadPedidoImage } from '@/lib/utils/uploadPedidoImage'
import { Linea, nuevaLinea, LineaProducto } from '@/components/ventas/LineaProducto'

type Producto = {
  marca: string; descripcion: string; talla: string; cantidad: number; precio_venta: number
  imagen_url?: string | null; articulo_id?: string | null; codigo?: string
}

// Línea del catálogo + foto del producto.
type LineaEdit = Linea & { imagen_url?: string | null }

interface Props {
  pedidoId: string
  sedeId: string
  sedeCodigo: string
  numeroOrden: string
  clienteId: string
  clienteNombre: string
  clienteTelefono: string
  notas: string | null
  tipoEntrega: 'sede' | 'domicilio'
  direccionEntrega: string | null
  productos: Producto[]
}

function productosALineas(productos: Producto[]): LineaEdit[] {
  if (productos.length === 0) return [{ ...nuevaLinea() }]
  return productos.map(p => ({
    ...nuevaLinea(),
    articulo_id:  p.articulo_id ?? null,
    codigo:       p.codigo ?? '',
    marca:        p.marca,
    descripcion:  p.descripcion,
    talla:        p.talla ?? '',
    cantidad:     p.cantidad,
    precio_venta: p.precio_venta,
    imagen_url:   p.imagen_url ?? null,
  }))
}

function propsAParsed(p: Props): ParsedPedido {
  const sede = p.sedeCodigo.slice(0, 2) as 'TR' | 'CR' | 'SR'
  return {
    formato_version: '1',
    sede,
    numero_orden_sugerido: p.numeroOrden,
    cliente_nombre: p.clienteNombre,
    cliente_doc: null,
    cliente_telefono: p.clienteTelefono,
    productos: [],
    total: 0,
    abono: 0,
    metodo_pago_abono: 'efectivo',
    tipo_entrega: p.tipoEntrega,
    direccion: p.direccionEntrega ?? null,
    notas: p.notas ?? null,
  }
}

function reconstruirTexto(p: Props): string {
  const lineas: string[] = []
  lineas.push(`Numero de pedido: ${p.numeroOrden}`)
  lineas.push(`Cliente: ${p.clienteNombre}`)
  lineas.push(`Celular: ${p.clienteTelefono}`)
  for (const prod of p.productos) {
    const art = [prod.marca, prod.descripcion].filter(Boolean).join(' ').trim() || prod.descripcion
    lineas.push(`Artículo: ${art}`)
    if (prod.talla) lineas.push(`Talla: ${prod.talla}`)
    lineas.push(`Precio: ${prod.precio_venta}`)
  }
  if (p.tipoEntrega === 'domicilio' && p.direccionEntrega) {
    lineas.push(`Dirección: ${p.direccionEntrega}`)
  }
  if (p.notas) lineas.push(`Notas: ${p.notas}`)
  return lineas.join('\n')
}

export function EditarPedidoForm(props: Props) {
  const { pedidoId, sedeId, sedeCodigo, clienteId } = props

  const [paso, setPaso]           = useState<'pegar' | 'preview'>('preview')
  const [texto, setTexto]         = useState(() => reconstruirTexto(props))
  const [errorParser, setErrorParser] = useState<string | null>(null)
  const [parsed, setParsed]       = useState<ParsedPedido>(() => propsAParsed(props))
  const [lineas, setLineas]       = useState<LineaEdit[]>(() => productosALineas(props.productos))
  const [numero, setNumero]       = useState(props.numeroOrden)
  const [error, setError]         = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Producto activo para pegar imagen (Ctrl+V).
  const activeIdxRef = useRef(0)

  useEffect(() => {
    if (paso !== 'preview') return
    async function onPaste(e: ClipboardEvent) {
      for (const item of Array.from(e.clipboardData?.items ?? [])) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (!file) continue
          const url = await uploadPedidoImage(file)
          if (url) {
            const idx = activeIdxRef.current
            setLineas(ls => ls.map((l, i) => i === idx ? { ...l, imagen_url: url } : l))
          }
          break
        }
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [paso])

  function handleParsear() {
    const result = parsearPedido(texto)
    if (!result.ok) {
      setErrorParser(result.error)
      return
    }
    setParsed(result.data)
    setLineas(productosALineas(result.data.productos.map(pp => ({
      marca: pp.marca, descripcion: pp.descripcion, talla: pp.talla ?? '',
      cantidad: pp.cantidad, precio_venta: pp.precio_venta,
      imagen_url: (pp as { imagen_url?: string | null }).imagen_url ?? null,
    }))))
    if (result.data.numero_orden_sugerido?.startsWith(sedeCodigo)) {
      setNumero(result.data.numero_orden_sugerido)
    }
    setErrorParser(null)
    setPaso('preview')
  }

  function updateField<K extends keyof ParsedPedido>(field: K, value: ParsedPedido[K]) {
    setParsed(prev => ({ ...prev, [field]: value }))
  }

  function setLinea(i: number, patch: Partial<LineaEdit>) {
    setLineas(ls => ls.map((l, j) => j === i ? { ...l, ...patch } : l))
  }

  function handleConfirmar() {
    setError(null)
    const productos = lineas.filter(l => l.descripcion.trim())
    if (productos.length === 0) { setError('Debe haber al menos un producto'); return }

    startTransition(async () => {
      const result = await editarPedidoAction(pedidoId, {
        numero_orden:      numero,
        notas:             parsed.notas ?? '',
        tipo_entrega:      parsed.tipo_entrega,
        direccion_entrega: parsed.direccion ?? '',
        cliente_nombre:    parsed.cliente_nombre,
        cliente_telefono:  parsed.cliente_telefono,
        cliente_id:        clienteId,
        productos: productos.map(l => ({
          articulo_id:  l.articulo_id ?? null,
          marca:        l.marca,
          descripcion:  l.descripcion,
          talla:        l.talla ?? '',
          cantidad:     l.cantidad,
          precio_venta: l.precio_venta,
          imagen_url:   l.imagen_url ?? null,
        })),
      })
      if (!result.ok) setError(result.error)
    })
  }

  const total = lineas.reduce((s, l) => s + l.precio_venta * l.cantidad, 0)

  // ── Paso 1: texto ──────────────────────────────────────────────────────────
  if (paso === 'pegar') {
    return (
      <div className="space-y-4">
        <p className="text-xs text-gray-500">
          El resumen del pedido aparece precargado. Edítalo o pega uno nuevo y pulsa <strong>Validar</strong>.
        </p>
        <textarea
          value={texto}
          onChange={e => { setTexto(e.target.value); setErrorParser(null) }}
          rows={14}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
        {errorParser && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            <p className="font-medium mb-1">Error en el formato:</p>
            <p className="font-mono text-xs">{errorParser}</p>
          </div>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleParsear}
            disabled={texto.trim().length < 10}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg shadow-sm"
          >
            Validar resumen →
          </button>
          <a
            href={`/pedidos/${pedidoId}`}
            className="px-4 py-2.5 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </a>
        </div>
      </div>
    )
  }

  // ── Paso 2: preview editable ───────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">Edita los campos y guarda los cambios</p>
        <button
          type="button"
          onClick={() => setPaso('pegar')}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          Editar como texto
        </button>
      </div>

      {/* Número de pedido */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Número de pedido</label>
        <input
          type="text"
          value={numero}
          onChange={e => setNumero(e.target.value.toUpperCase())}
          className="w-40 px-3 py-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-400 mt-1">Debe empezar con {sedeCodigo}</p>
      </div>

      {/* Cliente */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Cliente</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nombre</label>
            <input
              type="text"
              value={parsed.cliente_nombre}
              onChange={e => updateField('cliente_nombre', e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Celular</label>
            <input
              type="text"
              value={parsed.cliente_telefono}
              onChange={e => updateField('cliente_telefono', e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Entrega */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de entrega</label>
        <div className="flex gap-2 mb-3">
          {(['sede', 'domicilio'] as const).map(t => (
            <button key={t} type="button" onClick={() => updateField('tipo_entrega', t)}
              className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium capitalize active:scale-95 ${
                parsed.tipo_entrega === t
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white border-gray-300 text-gray-700 hover:border-blue-400'
              }`}>
              {t}
            </button>
          ))}
        </div>
        {parsed.tipo_entrega === 'domicilio' && (
          <input
            type="text"
            value={parsed.direccion ?? ''}
            onChange={e => updateField('direccion', e.target.value || null)}
            placeholder="Calle 10 # 5-20, Barrio Centro"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        )}
      </div>

      {/* Productos — módulo de catálogo (igual que al crear/facturar) + foto */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Productos</p>
        <div className="space-y-3">
          {lineas.map((l, i) => (
            <div key={l.key} className="flex gap-2 items-start" onMouseDown={() => { activeIdxRef.current = i }}>
              <ImagenProducto
                value={l.imagen_url ?? null}
                onChange={url => setLinea(i, { imagen_url: url ?? null })}
              />
              <div className="flex-1">
                <LineaProducto
                  linea={l}
                  sedeId={sedeId}
                  sedeCodigo={sedeCodigo}
                  onChange={patch => setLinea(i, patch)}
                  onRemove={lineas.length > 1 ? () => setLineas(ls => ls.filter((_, j) => j !== i)) : undefined}
                />
              </div>
            </div>
          ))}
        </div>
        <button type="button"
          onClick={() => setLineas(ls => [...ls, { ...nuevaLinea() }])}
          className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium">
          + Agregar producto
        </button>
        <p className="text-sm font-semibold text-gray-900 mt-3">
          Total: {formatCOP(total)}
        </p>
      </div>

      {/* Notas */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Notas <span className="text-gray-400 font-normal">(opcional)</span>
        </label>
        <textarea value={parsed.notas ?? ''} onChange={e => updateField('notas', e.target.value || null)} rows={3}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Instrucciones especiales, referencias, etc." />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>
      )}

      <div className="flex gap-3 pt-1">
        <button type="button" onClick={handleConfirmar} disabled={isPending}
          className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg shadow-sm">
          {isPending ? 'Guardando...' : 'Guardar cambios'}
        </button>
        <a href={`/pedidos/${pedidoId}`}
          className="px-4 py-2.5 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
          Cancelar
        </a>
      </div>
    </div>
  )
}
