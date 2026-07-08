'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { editarCompraAction, EditarCompraInput, EditarCompraItemInput, buscarPedidoPorOrdenAction } from '@/app/actions/compras'
import { buscarPorCodigoAction } from '@/app/actions/articulos'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { formatCOP, formatMiles } from '@/lib/utils/format'

type CuentaOpc = { id: string; nombre: string }

type ItemForm = {
  id?: string
  codigo: string
  descripcion: string
  marca: string
  talla: string
  cantidad: string
  costo_unitario_cop: string
  destino: 'pedido' | 'contoda' | 'sin_asignar'
  articuloId?: string | null
  articuloEncontrado?: boolean
  pedidoRef?: string
  pedidoOk?: boolean
  pedidoCliente?: string | null
}

export type ItemInicial = {
  id: string
  codigo: string
  descripcion: string
  marca: string
  talla: string
  cantidad: number
  costo_unitario_cop: number
  destino: 'pedido' | 'contoda' | 'sin_asignar'
  articulo_id: string | null
  pedido_ref: string
}

interface Props {
  compraId: string
  inicial: {
    tipo: 'usa' | 'colombia'
    proveedor: string
    fecha: string
    numero_factura: string
    total_usd: number | null
    trm: number | null
    total_cop: number
    notas: string
    cuenta_id: string | null
  }
  itemsIniciales: ItemInicial[]
  cuentas: CuentaOpc[]
}

export function EditarCompraForm({ compraId, inicial, itemsIniciales, cuentas }: Props) {
  const router = useRouter()
  const [tipo, setTipo] = useState(inicial.tipo)
  const [proveedor, setProveedor] = useState(inicial.proveedor)
  const [numeroFactura, setNumeroFactura] = useState(inicial.numero_factura)
  const [fecha, setFecha] = useState(inicial.fecha)
  const [totalUsd, setTotalUsd] = useState(inicial.total_usd?.toString() ?? '')
  const [totalCopPagado, setTotalCopPagado] = useState(inicial.total_cop.toString())
  const [notas, setNotas] = useState(inicial.notas)
  const [cuentaId, setCuentaId] = useState(inicial.cuenta_id ?? '')
  const [items, setItems] = useState<ItemForm[]>(() => itemsIniciales.map(i => ({
    id: i.id,
    codigo: i.codigo,
    descripcion: i.descripcion,
    marca: i.marca,
    talla: i.talla,
    cantidad: String(i.cantidad),
    costo_unitario_cop: i.costo_unitario_cop ? String(i.costo_unitario_cop) : '',
    destino: i.destino,
    articuloId: i.articulo_id,
    articuloEncontrado: i.articulo_id ? true : undefined,
    pedidoRef: i.pedido_ref,
    pedidoOk: i.pedido_ref ? true : undefined,
  })))
  const [error, setError] = useState<string | null>(null)
  const [isSaving, startSaving] = useTransition()

  const totalCopNum = parseInt(totalCopPagado.replace(/\D/g, ''), 10) || 0
  const trmCalculada = tipo === 'usa' && totalUsd && totalCopPagado
    ? Math.round(parseFloat(totalCopPagado.replace(/\D/g, '')) / parseFloat(totalUsd))
    : null

  function agregarItem() {
    setItems(prev => [
      ...prev,
      { codigo: '', descripcion: '', marca: '', talla: '', cantidad: '1', costo_unitario_cop: '', destino: 'sin_asignar' },
    ])
  }

  function eliminarItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  function actualizarItem(idx: number, campo: keyof ItemForm, valor: string) {
    setItems(prev => prev.map((item, i) => (i === idx ? { ...item, [campo]: valor } : item)))
  }

  async function buscarPorCodigo(idx: number, codigo: string) {
    const cod = codigo.trim()
    if (!cod) {
      setItems(prev => prev.map((item, i) => i === idx ? { ...item, articuloId: null, articuloEncontrado: undefined } : item))
      return
    }
    const articulo = await buscarPorCodigoAction(cod)
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item
      if (articulo) {
        return { ...item, articuloId: articulo.id, articuloEncontrado: true, descripcion: articulo.nombre, marca: articulo.marca }
      }
      return { ...item, articuloId: null, articuloEncontrado: false }
    }))
  }

  async function buscarPedidoRef(idx: number, ref: string) {
    const r = ref.trim()
    if (!r) {
      setItems(prev => prev.map((item, i) => i === idx ? { ...item, pedidoOk: undefined, pedidoCliente: null } : item))
      return
    }
    const pedido = await buscarPedidoPorOrdenAction(r)
    const m = r.toUpperCase().match(/-(\d+)$/)
    const itemIdx = m ? parseInt(m[1], 10) - 1 : 0
    const prod = pedido?.items?.[itemIdx] ?? pedido?.items?.[0] ?? null

    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item
      if (!pedido) return { ...item, pedidoOk: false, pedidoCliente: null }
      return {
        ...item,
        pedidoOk: true,
        pedidoCliente: pedido.cliente_nombre,
        ...(prod ? {
          codigo:      prod.codigo || item.codigo,
          descripcion: prod.descripcion || item.descripcion,
          marca:       prod.marca || item.marca,
          talla:       prod.talla || item.talla,
          articuloId:  prod.articulo_id ?? item.articuloId ?? null,
          articuloEncontrado: prod.articulo_id ? true : item.articuloEncontrado,
        } : {}),
      }
    }))
  }

  function handleGuardar() {
    setError(null)
    if (!proveedor.trim()) { setError('El proveedor es obligatorio'); return }
    if (tipo === 'usa' && (!totalUsd || parseFloat(totalUsd) <= 0)) { setError('Total USD es obligatorio'); return }
    if (!totalCopPagado || totalCopNum <= 0) { setError('Total COP es obligatorio'); return }

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (!item.descripcion.trim()) { setError(`Producto ${i + 1}: falta la descripción`); return }
      if (!parseInt(item.cantidad, 10)) { setError(`Producto ${i + 1}: cantidad inválida`); return }
      if (item.destino === 'pedido' && !item.pedidoRef?.trim()) { setError(`Producto ${i + 1}: indica el número de pedido`); return }
    }

    const itemsPayload: EditarCompraItemInput[] = items.map(item => ({
      id:                 item.id,
      codigo:             item.codigo.trim() || undefined,
      descripcion:        item.descripcion.trim(),
      marca:              item.marca.trim(),
      talla:              item.talla.trim(),
      cantidad:           parseInt(item.cantidad, 10),
      costo_unitario_cop: parseInt(item.costo_unitario_cop.replace(/\D/g, ''), 10) || 0,
      destino:            item.destino,
      articulo_id:        item.articuloId ?? null,
      pedido_ref:         item.destino === 'pedido' ? (item.pedidoRef?.trim() || undefined) : undefined,
    }))

    const payload: EditarCompraInput = {
      tipo,
      proveedor: proveedor.trim(),
      fecha,
      numero_factura: numeroFactura.trim(),
      total_usd: tipo === 'usa' ? parseFloat(totalUsd) : null,
      trm: tipo === 'usa' ? (trmCalculada ?? null) : null,
      total_cop: totalCopNum,
      notas,
      cuenta_id: cuentaId || null,
      items: itemsPayload,
    }

    startSaving(async () => {
      try {
        const result = await editarCompraAction(compraId, payload)
        if (!result.ok) { setError(result.error); return }
        router.push(`/compras/${compraId}`)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al guardar la compra')
      }
    })
  }

  const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-900">Datos de la factura</h2>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Tipo */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Tipo de factura</label>
            <div className="flex gap-2">
              {(['usa', 'colombia'] as const).map(t => (
                <button key={t} type="button" onClick={() => setTipo(t)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                    tipo === t
                      ? t === 'usa' ? 'bg-blue-600 text-white border-blue-600' : 'bg-green-600 text-white border-green-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}>
                  {t === 'usa' ? 'Dólares (USD)' : 'Pesos (COP)'}
                </button>
              ))}
            </div>
          </div>

          {/* Proveedor + N° Factura + Fecha */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Proveedor *</label>
              <input type="text" value={proveedor} onChange={e => setProveedor(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">N° Factura</label>
              <input type="text" value={numeroFactura} onChange={e => setNumeroFactura(e.target.value)} placeholder="INV-12345" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Fecha *</label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Montos */}
          {tipo === 'usa' ? (
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Total USD *</label>
                <input type="number" min="0" step="0.01" value={totalUsd} onChange={e => setTotalUsd(e.target.value)} placeholder="0.00" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Total COP pagado *</label>
                <input type="text" inputMode="numeric" value={formatMiles(totalCopPagado)}
                  onChange={e => setTotalCopPagado(e.target.value.replace(/\D/g, ''))}
                  placeholder="0" className={inputCls} />
                {totalCopNum > 0 && <p className="text-xs text-gray-400 mt-1">{formatCOP(totalCopNum)}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">TRM calculada</label>
                <div className={`${inputCls} bg-gray-50 text-gray-700 font-medium`}>
                  {trmCalculada ? `$${trmCalculada.toLocaleString('es-CO')}` : '—'}
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-xs">
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Total COP *</label>
              <input type="text" inputMode="numeric" value={formatMiles(totalCopPagado)}
                onChange={e => setTotalCopPagado(e.target.value.replace(/\D/g, ''))}
                placeholder="0" className={inputCls} />
              {totalCopNum > 0 && <p className="text-xs text-gray-400 mt-1">{formatCOP(totalCopNum)}</p>}
            </div>
          )}

          {/* Cuenta de pago */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Cuenta de pago</label>
            <select value={cuentaId} onChange={e => setCuentaId(e.target.value)} className={inputCls}>
              <option value="">— Sin especificar (no descuenta saldo) —</option>
              {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            {cuentaId ? (
              <p className="text-xs text-green-700 mt-1">
                Se registrará un egreso de {formatCOP(totalCopNum)} en esta cuenta
              </p>
            ) : (
              <p className="text-xs text-gray-400 mt-1">
                Selecciona una cuenta para que el gasto se refleje en el flujo de caja
              </p>
            )}
          </div>

          {/* Notas */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Notas</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
              placeholder="Observaciones sobre la compra..."
              className={`${inputCls} resize-none`} />
          </div>
        </CardContent>
      </Card>

      {/* Productos */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Productos ({items.length})</h2>
            <button type="button" onClick={agregarItem} className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              + Agregar
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">Esta compra no tiene productos. Usa “+ Agregar”.</p>
          )}
          {items.map((item, idx) => (
            <div key={item.id ?? `nuevo-${idx}`} className="border border-gray-100 rounded-lg p-4 space-y-3 bg-gray-50">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Producto {idx + 1}{!item.id && <span className="ml-2 text-blue-500 normal-case">(nuevo)</span>}
                </span>
                <button type="button" onClick={() => eliminarItem(idx)} className="text-xs text-red-500 hover:text-red-700">
                  Eliminar
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Código SKU con lookup al catálogo */}
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Código del artículo (SKU)</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={item.codigo}
                      onChange={e => actualizarItem(idx, 'codigo', e.target.value)}
                      onBlur={e => buscarPorCodigo(idx, e.target.value)}
                      placeholder="Ej: DV3337-100 — opcional"
                      className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 bg-white font-mono ${
                        item.articuloEncontrado === true  ? 'border-green-400 focus:ring-green-400' :
                        item.articuloEncontrado === false ? 'border-amber-400 focus:ring-amber-400' :
                        'border-gray-300 focus:ring-blue-500'
                      }`}
                    />
                    {item.articuloEncontrado === true && (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                        ✓ En catálogo
                      </span>
                    )}
                    {item.articuloEncontrado === false && (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                        Artículo nuevo
                      </span>
                    )}
                  </div>
                </div>

                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Descripción *</label>
                  <input type="text" value={item.descripcion}
                    onChange={e => actualizarItem(idx, 'descripcion', e.target.value)}
                    placeholder="Nike Air Max 95, pantalón cargo..."
                    className={`${inputCls} bg-white`} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Marca</label>
                  <input type="text" value={item.marca}
                    onChange={e => actualizarItem(idx, 'marca', e.target.value)}
                    placeholder="Nike, Adidas..."
                    className={`${inputCls} bg-white`} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Talla</label>
                  <input type="text" value={item.talla}
                    onChange={e => actualizarItem(idx, 'talla', e.target.value)}
                    placeholder="40, L, XL..."
                    className={`${inputCls} bg-white`} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Cantidad *</label>
                  <input type="number" min="1" value={item.cantidad}
                    onChange={e => actualizarItem(idx, 'cantidad', e.target.value)}
                    className={`${inputCls} bg-white`} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Costo unit. COP</label>
                  <input type="text" inputMode="numeric" value={formatMiles(item.costo_unitario_cop)}
                    onChange={e => actualizarItem(idx, 'costo_unitario_cop', e.target.value.replace(/\D/g, ''))}
                    placeholder="opcional"
                    className={`${inputCls} bg-white`} />
                  {item.costo_unitario_cop && (
                    <p className="text-xs text-gray-400 mt-1">{formatCOP(parseInt(item.costo_unitario_cop, 10) || 0)}</p>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Destino</label>
                  <select value={item.destino}
                    onChange={e => actualizarItem(idx, 'destino', e.target.value)}
                    className={`${inputCls} bg-white`}>
                    <option value="sin_asignar">Stock tienda (sin asignar)</option>
                    <option value="pedido">Asignar a pedido</option>
                    <option value="contoda">Para Contoda</option>
                  </select>
                </div>

                {item.destino === 'pedido' && (
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">
                      N° de pedido <span className="text-gray-400">(ej: TR6492)</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={item.pedidoRef ?? ''}
                        onChange={e => actualizarItem(idx, 'pedidoRef', e.target.value.toUpperCase())}
                        onBlur={e => buscarPedidoRef(idx, e.target.value)}
                        placeholder="TR6492"
                        className={`w-full rounded-lg border px-3 py-2 text-sm font-mono bg-white focus:outline-none focus:ring-2 ${
                          item.pedidoOk === true  ? 'border-green-400 focus:ring-green-400' :
                          item.pedidoOk === false ? 'border-red-400 focus:ring-red-400' :
                          'border-gray-300 focus:ring-blue-500'
                        }`}
                      />
                      {item.pedidoOk === true && (
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                          ✓ Encontrado
                        </span>
                      )}
                      {item.pedidoOk === false && (
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                          No existe
                        </span>
                      )}
                    </div>
                    {item.pedidoOk === true && item.pedidoCliente && (
                      <p className="text-xs text-green-600 mt-0.5">Cliente: {item.pedidoCliente}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="flex gap-3">
        <button onClick={handleGuardar} disabled={isSaving}
          className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
          {isSaving ? 'Guardando...' : 'Guardar cambios'}
        </button>
        <button onClick={() => router.push(`/compras/${compraId}`)}
          className="px-5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">
          Cancelar
        </button>
      </div>
    </div>
  )
}
