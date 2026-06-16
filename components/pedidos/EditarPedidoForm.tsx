'use client'

import { useState, useTransition } from 'react'
import { parsearPedido } from '@/lib/parser'
import { ParsedPedido } from '@/types'
import { editarPedidoAction } from '@/app/actions/pedidos'
import { formatCOP } from '@/lib/utils/format'
import { ImagenProducto } from '@/components/pedidos/ImagenProducto'

type Producto = { marca: string; descripcion: string; talla: string; cantidad: number; precio_venta: number; imagen_url?: string | null }

interface Props {
  pedidoId: string
  sedeCodigo: string
  numeroOrden: string
  clienteId: string
  clienteNombre: string
  clienteTelefono: string
  notas: string | null
  tipoEntrega: 'sede' | 'domicilio'
  direccionEntrega: string | null
  numeroGuia: string | null
  productos: Producto[]
}

function reconstruirTexto(p: Props): string {
  const lineas: string[] = []
  lineas.push(`Número de pedido: ${p.numeroOrden}`)
  lineas.push(`Nombre: ${p.clienteNombre}`)
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
  const { pedidoId, sedeCodigo, clienteId } = props

  const [paso, setPaso]           = useState<'pegar' | 'preview'>('pegar')
  const [texto, setTexto]         = useState(() => reconstruirTexto(props))
  const [errorParser, setErrorParser] = useState<string | null>(null)
  const [parsed, setParsed]       = useState<ParsedPedido | null>(null)
  const [numero, setNumero]       = useState(props.numeroOrden)
  const [guia, setGuia]           = useState(props.numeroGuia ?? '')
  const [error, setError]         = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleParsear() {
    const result = parsearPedido(texto)
    if (!result.ok) {
      setErrorParser(result.error)
      return
    }
    setParsed(result.data)
    if (result.data.numero_orden_sugerido?.startsWith(sedeCodigo)) {
      setNumero(result.data.numero_orden_sugerido)
    }
    setErrorParser(null)
    setPaso('preview')
  }

  function updateField<K extends keyof ParsedPedido>(field: K, value: ParsedPedido[K]) {
    setParsed(prev => prev ? { ...prev, [field]: value } : null)
  }

  function updateProducto(idx: number, field: string, value: string | number | null) {
    setParsed(prev => {
      if (!prev) return null
      const productos = prev.productos.map((p, i) => i === idx ? { ...p, [field]: value } : p)
      return { ...prev, productos }
    })
  }

  function handleConfirmar() {
    if (!parsed) return
    setError(null)
    startTransition(async () => {
      const result = await editarPedidoAction(pedidoId, {
        numero_orden:      numero,
        notas:             parsed.notas ?? '',
        tipo_entrega:      parsed.tipo_entrega,
        direccion_entrega: parsed.direccion ?? '',
        numero_guia:       guia,
        cliente_nombre:    parsed.cliente_nombre,
        cliente_telefono:  parsed.cliente_telefono,
        cliente_id:        clienteId,
        productos: parsed.productos.map(p => ({
          marca:        p.marca,
          descripcion:  p.descripcion,
          talla:        p.talla ?? '',
          cantidad:     p.cantidad,
          precio_venta: p.precio_venta,
          imagen_url:   (p as any).imagen_url ?? null,
        })),
      })
      if (!result.ok) setError(result.error)
    })
  }

  const total = parsed?.productos.reduce((s, p) => s + p.precio_venta * p.cantidad, 0) ?? 0

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
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
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
  if (!parsed) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">Revisa y edita antes de guardar</p>
        <button
          type="button"
          onClick={() => { setPaso('pegar'); setParsed(null) }}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          ← Volver al texto
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
              className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium capitalize transition-colors ${
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

      {/* Productos */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Productos</p>
        <div className="space-y-3">
          {parsed.productos.map((p, i) => (
            <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2">
              <div className="flex gap-2">
                <ImagenProducto
                  value={(p as any).imagen_url ?? null}
                  onChange={url => updateProducto(i, 'imagen_url', url ?? null)}
                />
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 mb-0.5">Artículo</label>
                      <input type="text"
                        value={[p.marca, p.descripcion].filter(Boolean).join(' ')}
                        onChange={e => { updateProducto(i, 'marca', ''); updateProducto(i, 'descripcion', e.target.value) }}
                        className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div className="w-20">
                      <label className="block text-xs text-gray-500 mb-0.5">Talla</label>
                      <input type="text"
                        value={p.talla ?? ''}
                        onChange={e => updateProducto(i, 'talla', e.target.value)}
                        className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  <div className="max-w-[160px]">
                    <label className="block text-xs text-gray-500 mb-0.5">Precio</label>
                    <input type="number" min={0}
                      value={p.precio_venta}
                      onChange={e => updateProducto(i, 'precio_venta', parseInt(e.target.value) || 0)}
                      className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              </div>
              {parsed.productos.length > 1 && (
                <button type="button"
                  onClick={() => setParsed(prev => prev ? { ...prev, productos: prev.productos.filter((_, j) => j !== i) } : null)}
                  className="text-xs text-red-500 hover:text-red-700">
                  Quitar producto
                </button>
              )}
            </div>
          ))}
        </div>
        <button type="button"
          onClick={() => setParsed(prev => prev ? { ...prev, productos: [...prev.productos, { marca: '', descripcion: '', talla: null, cantidad: 1, precio_venta: 0 }] } : null)}
          className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium">
          + Agregar producto
        </button>
        <p className="text-sm font-semibold text-gray-900 mt-3">
          Total: {formatCOP(total)}
        </p>
      </div>

      {/* Número de guía */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Número de guía <span className="text-gray-400 font-normal">(opcional)</span>
        </label>
        <input type="text" value={guia} onChange={e => setGuia(e.target.value)}
          placeholder="USPS, FedEx, DHL, Servientrega…"
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
          className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
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
