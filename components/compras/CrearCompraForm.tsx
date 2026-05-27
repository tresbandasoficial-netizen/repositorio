'use client'

import { useState, useTransition, useRef } from 'react'
import { crearCompraAction, CrearCompraInput, CompraItemInput } from '@/app/actions/compras'
import { parsearFacturaAction, FacturaExtraida } from '@/app/actions/parsear-factura'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { formatCOP } from '@/lib/utils/format'

type Paso = 'subir' | 'revisar' | 'guardando'

type ItemForm = {
  descripcion: string
  marca: string
  talla: string
  cantidad: string
  precio_usd?: number | null   // precio original de la factura, para calcular COP
  costo_unitario_cop: string
  destino: 'pedido' | 'contoda' | 'sin_asignar'
}

function facturaToItems(items: FacturaExtraida['items'], moneda: 'USD' | 'COP'): ItemForm[] {
  return items.map((i) => ({
    descripcion: i.descripcion,
    marca: i.marca,
    talla: i.talla,
    cantidad: String(i.cantidad || 1),
    precio_usd: moneda === 'USD' ? (i.precio_usd ?? null) : null,
    // Para COP el AI ya devuelve el precio unitario exacto de la factura
    costo_unitario_cop: moneda === 'COP' && i.precio_usd ? String(Math.round(i.precio_usd)) : '',
    destino: 'sin_asignar' as const,
  }))
}

export function CrearCompraForm() {
  const [paso, setPaso] = useState<Paso>('subir')
  const [factura, setFactura] = useState<FacturaExtraida | null>(null)

  // Campos de la factura
  const [tipo, setTipo] = useState<'usa' | 'colombia'>('usa')
  const [proveedor, setProveedor] = useState('')
  const [numeroFactura, setNumeroFactura] = useState('')
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [totalUsd, setTotalUsd] = useState('')
  const [totalCopPagado, setTotalCopPagado] = useState('')
  const [subtotalUsd, setSubtotalUsd] = useState('')
  const [impuestosUsd, setImpuestosUsd] = useState('')
  const [envioUsd, setEnvioUsd] = useState('')
  const [notas, setNotas] = useState('')
  const [items, setItems] = useState<ItemForm[]>([])

  const [error, setError] = useState<string | null>(null)
  const [isParsing, startParsing] = useTransition()
  const [isSaving, startSaving] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  // TRM calculada automáticamente
  const trmCalculada =
    tipo === 'usa' && totalUsd && totalCopPagado
      ? Math.round(parseFloat(totalCopPagado.replace(/\D/g, '')) / parseFloat(totalUsd))
      : null

  const totalCopNum = parseInt(totalCopPagado.replace(/\D/g, ''), 10) || 0

  // Recalcular costos COP usando tasas reales de tax y envío
  function recalcularCostos(trm: number, taxUsd: number, shippingUsd: number) {
    setItems(prev => {
      const subtotal = prev.reduce((s, item) => s + (item.precio_usd ?? 0), 0)
      const taxRate = subtotal > 0 ? taxUsd / subtotal : 0
      const shippingRate = subtotal > 0 ? shippingUsd / subtotal : 0
      return prev.map(item => {
        if (!item.precio_usd) return item
        const cantidad = parseInt(item.cantidad, 10) || 1
        const unitPriceUsd = item.precio_usd / cantidad
        const realCostUsd = unitPriceUsd * (1 + taxRate + shippingRate)
        return { ...item, costo_unitario_cop: String(Math.round(realCostUsd * trm)) }
      })
    })
  }

  function agregarItem() {
    setItems((prev) => [
      ...prev,
      { descripcion: '', marca: '', talla: '', cantidad: '1', precio_usd: null, costo_unitario_cop: '', destino: 'sin_asignar' },
    ])
  }

  function eliminarItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  function actualizarItem(idx: number, campo: keyof ItemForm, valor: string) {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [campo]: valor } : item)))
  }

  function handleArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)

    const reader = new FileReader()
    reader.onload = () => {
      const base64Full = reader.result as string
      const base64 = base64Full.split(',')[1]
      const mediaType = file.type as any

      startParsing(async () => {
        const result = await parsearFacturaAction(base64, mediaType, tipo)
        if (!result.ok) {
          setError(result.error)
          return
        }

        const data = result.data
        setFactura(data)
        setProveedor(data.proveedor)
        setFecha(data.fecha)
        setNumeroFactura(data.numero_factura ?? '')
        if (tipo === 'colombia') {
          setTotalCopPagado(String(Math.round(data.total_usd)))
          setTotalUsd('')
          setSubtotalUsd('')
          setImpuestosUsd('')
          setEnvioUsd('')
        } else {
          setTotalUsd(String(data.total_usd))
          setSubtotalUsd(String(data.subtotal_usd || ''))
          setImpuestosUsd(String(data.tax_usd || ''))
          setEnvioUsd(String(data.shipping_usd || ''))
        }
        setItems(facturaToItems(data.items, tipo === 'colombia' ? 'COP' : 'USD'))
        setPaso('revisar')
      })
    }
    reader.readAsDataURL(file)
  }

  function handleConfirmar() {
    setError(null)

    if (!proveedor.trim()) { setError('El proveedor es obligatorio'); return }
    if (tipo === 'usa') {
      if (!totalUsd || parseFloat(totalUsd) <= 0) { setError('El total en USD es obligatorio'); return }
      if (!totalCopPagado || totalCopNum <= 0) { setError('Ingresa el total que pagaste en COP'); return }
    } else {
      if (!totalCopPagado || totalCopNum <= 0) { setError('El total en COP es obligatorio'); return }
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (!item.descripcion.trim()) { setError(`Item ${i + 1}: falta la descripción`); return }
      if (!parseInt(item.cantidad, 10)) { setError(`Item ${i + 1}: cantidad inválida`); return }
    }

    const itemsValidos: CompraItemInput[] = items.map((item) => ({
      descripcion: item.descripcion.trim(),
      marca: item.marca.trim(),
      talla: item.talla.trim(),
      cantidad: parseInt(item.cantidad, 10),
      costo_unitario_cop: parseInt(item.costo_unitario_cop.replace(/\D/g, ''), 10) || 0,
      destino: item.destino,
    }))

    const payload: CrearCompraInput = {
      tipo,
      proveedor: proveedor.trim(),
      fecha,
      numero_factura: numeroFactura.trim(),
      total_usd: tipo === 'usa' ? parseFloat(totalUsd) : null,
      trm: tipo === 'usa' ? (trmCalculada ?? null) : null,
      total_cop: totalCopNum,
      notas,
      items: itemsValidos,
    }

    startSaving(async () => {
      const result = await crearCompraAction(payload)
      if (!result.ok) setError(result.error)
    })
  }

  // ── Paso 1: subir factura ───────────────────────────────────────────────────
  if (paso === 'subir') {
    return (
      <div className="max-w-xl space-y-4">
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-gray-900">Nueva compra</h2>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Tipo de factura */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">¿La factura es en...?</label>
              <div className="flex gap-2">
                {(['usa', 'colombia'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipo(t)}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                      tipo === t
                        ? t === 'usa' ? 'bg-blue-600 text-white border-blue-600' : 'bg-green-600 text-white border-green-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {t === 'usa' ? 'Dólares (USD)' : 'Pesos (COP)'}
                  </button>
                ))}
              </div>
            </div>

            {/* Subir archivo */}
            <label className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl p-10 cursor-pointer transition-colors ${
              isParsing ? 'border-blue-300 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
            }`}>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={handleArchivo}
                disabled={isParsing}
                className="hidden"
              />
              {isParsing ? (
                <>
                  <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-blue-600 font-medium">Extrayendo datos de la factura...</p>
                </>
              ) : (
                <>
                  <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-700">Haz clic para subir la factura</p>
                    <p className="text-xs text-gray-400 mt-0.5">PDF, JPG o PNG</p>
                  </div>
                </>
              )}
            </label>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <p className="text-xs text-gray-400 text-center">
              También puedes{' '}
              <button
                type="button"
                onClick={() => { setItems([{ descripcion: '', marca: '', talla: '', cantidad: '1', costo_unitario_cop: '', destino: 'sin_asignar' }]); setPaso('revisar') }}
                className="underline hover:text-gray-600"
              >
                ingresar los datos manualmente
              </button>
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Paso 2: revisar y confirmar ─────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-3xl">
      {factura && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800 flex items-center justify-between">
          <span>✓ Datos extraídos de la factura. Revisa y corrige si es necesario.</span>
          <button
            type="button"
            onClick={() => { setFecha(''); setPaso('subir'); setFactura(null); setError(null) }}
            className="text-xs underline text-green-700 hover:text-green-900 ml-4 shrink-0"
          >
            Subir otra
          </button>
        </div>
      )}

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-900">Datos de la factura</h2>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Proveedor + Número de factura + Fecha */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Proveedor</label>
              <input
                type="text"
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
                placeholder="Nombre del proveedor"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">N° Factura</label>
              <input
                type="text"
                value={numeroFactura}
                onChange={(e) => setNumeroFactura(e.target.value)}
                placeholder="INV-12345"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Fecha</label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Montos */}
          {tipo === 'usa' ? (
            <div className="space-y-4">
              {/* Fila 1: Total USD | Total COP pagado | TRM calculada */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Total USD (factura)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={totalUsd}
                    onChange={(e) => setTotalUsd(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Total COP pagado</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={totalCopPagado}
                    onChange={(e) => {
                      const cop = e.target.value.replace(/\D/g, '')
                      setTotalCopPagado(cop)
                      const usd = parseFloat(totalUsd)
                      const copNum = parseInt(cop, 10)
                      if (usd > 0 && copNum > 0) {
                        const trm = Math.round(copNum / usd)
                        recalcularCostos(trm, parseFloat(impuestosUsd) || 0, parseFloat(envioUsd) || 0)
                      }
                    }}
                    placeholder="0"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {totalCopNum > 0 && (
                    <p className="text-xs text-gray-400 mt-1">{formatCOP(totalCopNum)}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">TRM calculada</label>
                  <div className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700">
                    {trmCalculada ? `$${trmCalculada.toLocaleString('es-CO')}` : '—'}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">COP por USD</p>
                </div>
              </div>

              {/* Fila 2: Subtotal USD | Impuestos USD | Envío USD */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Subtotal USD</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={subtotalUsd}
                    onChange={(e) => setSubtotalUsd(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Impuestos USD</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={impuestosUsd}
                    onChange={(e) => {
                      setImpuestosUsd(e.target.value)
                      if (trmCalculada) {
                        recalcularCostos(trmCalculada, parseFloat(e.target.value) || 0, parseFloat(envioUsd) || 0)
                      }
                    }}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Envío USD</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={envioUsd}
                    onChange={(e) => {
                      setEnvioUsd(e.target.value)
                      if (trmCalculada) {
                        recalcularCostos(trmCalculada, parseFloat(impuestosUsd) || 0, parseFloat(e.target.value) || 0)
                      }
                    }}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Tasas calculadas y botón recalcular */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  {subtotalUsd && parseFloat(subtotalUsd) > 0 ? (
                    <>
                      Tasa impuestos: {(parseFloat(impuestosUsd || '0') / parseFloat(subtotalUsd) * 100).toFixed(2)}%
                      {' | '}
                      Tasa envío: {(parseFloat(envioUsd || '0') / parseFloat(subtotalUsd) * 100).toFixed(2)}%
                    </>
                  ) : null}
                </p>
                {trmCalculada && (
                  <button
                    type="button"
                    onClick={() => recalcularCostos(trmCalculada, parseFloat(impuestosUsd) || 0, parseFloat(envioUsd) || 0)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium border border-blue-300 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-colors"
                  >
                    Recalcular costos
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="max-w-xs">
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Total COP</label>
              <input
                type="text"
                inputMode="numeric"
                value={totalCopPagado}
                onChange={(e) => setTotalCopPagado(e.target.value.replace(/\D/g, ''))}
                placeholder="0"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {totalCopNum > 0 && <p className="text-xs text-gray-400 mt-1">{formatCOP(totalCopNum)}</p>}
            </div>
          )}

          {/* Notas */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Notas (opcional)</label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
              placeholder="Observaciones sobre la factura..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Productos ({items.length})</h2>
            <button
              type="button"
              onClick={agregarItem}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              + Agregar
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.map((item, idx) => (
            <div key={idx} className="border border-gray-100 rounded-lg p-4 space-y-3 bg-gray-50">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Producto {idx + 1}</span>
                {items.length > 1 && (
                  <button type="button" onClick={() => eliminarItem(idx)} className="text-xs text-red-500 hover:text-red-700">
                    Eliminar
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Descripción *</label>
                  <input
                    type="text"
                    value={item.descripcion}
                    onChange={(e) => actualizarItem(idx, 'descripcion', e.target.value)}
                    placeholder="Nike Air Max 95, pantalón cargo..."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Marca</label>
                  <input
                    type="text"
                    value={item.marca}
                    onChange={(e) => actualizarItem(idx, 'marca', e.target.value)}
                    placeholder="Nike, Adidas..."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Talla</label>
                  <input
                    type="text"
                    value={item.talla}
                    onChange={(e) => actualizarItem(idx, 'talla', e.target.value)}
                    placeholder="40, L, XL..."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Cantidad *</label>
                  <input
                    type="number"
                    min="1"
                    value={item.cantidad}
                    onChange={(e) => actualizarItem(idx, 'cantidad', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Costo unit. COP</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={item.costo_unitario_cop}
                    onChange={(e) => actualizarItem(idx, 'costo_unitario_cop', e.target.value.replace(/\D/g, ''))}
                    placeholder="opcional"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                  {item.costo_unitario_cop && (
                    <p className="text-xs text-gray-400 mt-1">{formatCOP(parseInt(item.costo_unitario_cop, 10) || 0)}</p>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Destino</label>
                  <select
                    value={item.destino}
                    onChange={(e) => actualizarItem(idx, 'destino', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="sin_asignar">Stock tienda (sin asignar)</option>
                    <option value="pedido">Asignar a pedido</option>
                    <option value="contoda">Para Contoda</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <Button onClick={handleConfirmar} disabled={isSaving} size="md" className="w-full max-w-3xl">
        {isSaving ? 'Guardando compra...' : 'Confirmar y guardar compra'}
      </Button>
    </div>
  )
}
