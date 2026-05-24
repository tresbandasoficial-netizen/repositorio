'use client'

import { useState, useTransition } from 'react'
import { crearCompraAction, CrearCompraInput, CompraItemInput } from '@/app/actions/compras'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { formatCOP } from '@/lib/utils/format'

type ItemForm = {
  descripcion: string
  marca: string
  talla: string
  cantidad: string
  costo_unitario_cop: string
  destino: 'pedido' | 'contoda' | 'sin_asignar'
}

const itemVacio = (): ItemForm => ({
  descripcion: '',
  marca: '',
  talla: '',
  cantidad: '1',
  costo_unitario_cop: '',
  destino: 'sin_asignar',
})

export function CrearCompraForm() {
  const [tipo, setTipo] = useState<'usa' | 'colombia'>('usa')
  const [proveedor, setProveedor] = useState('')
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [totalUsd, setTotalUsd] = useState('')
  const [trm, setTrm] = useState('')
  const [totalCopDirecto, setTotalCopDirecto] = useState('')
  const [notas, setNotas] = useState('')
  const [items, setItems] = useState<ItemForm[]>([itemVacio()])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const totalCopCalculado =
    tipo === 'usa' && totalUsd && trm
      ? Math.round(parseFloat(totalUsd) * parseFloat(trm))
      : null

  const totalCopFinal =
    tipo === 'usa'
      ? (totalCopCalculado ?? 0)
      : parseInt(totalCopDirecto.replace(/\D/g, ''), 10) || 0

  function agregarItem() {
    setItems((prev) => [...prev, itemVacio()])
  }

  function eliminarItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  function actualizarItem(idx: number, campo: keyof ItemForm, valor: string) {
    setItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [campo]: valor } : item))
    )
  }

  function handleConfirmar() {
    setError(null)

    if (!proveedor.trim()) {
      setError('El proveedor es obligatorio')
      return
    }

    if (tipo === 'usa') {
      if (!totalUsd || parseFloat(totalUsd) <= 0) {
        setError('El total en USD es obligatorio para compras USA')
        return
      }
      if (!trm || parseFloat(trm) <= 0) {
        setError('La TRM es obligatoria para compras USA')
        return
      }
    } else {
      if (!totalCopDirecto || totalCopFinal <= 0) {
        setError('El total en COP es obligatorio')
        return
      }
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (!item.descripcion.trim()) {
        setError(`El item ${i + 1} debe tener descripción`)
        return
      }
      const cant = parseInt(item.cantidad, 10)
      if (!cant || cant <= 0) {
        setError(`La cantidad del item ${i + 1} debe ser mayor a 0`)
        return
      }
      const costo = parseInt(item.costo_unitario_cop.replace(/\D/g, ''), 10)
      if (isNaN(costo) || costo < 0) {
        setError(`El costo unitario del item ${i + 1} es inválido`)
        return
      }
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
      total_usd: tipo === 'usa' ? parseFloat(totalUsd) : null,
      trm: tipo === 'usa' ? parseFloat(trm) : null,
      total_cop: totalCopFinal,
      notas,
      items: itemsValidos,
    }

    startTransition(async () => {
      const result = await crearCompraAction(payload)
      if (!result.ok) {
        setError(result.error)
      }
    })
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-900">Datos de la factura</h2>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Tipo */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Tipo de compra
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTipo('usa')}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  tipo === 'usa'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                USA
              </button>
              <button
                type="button"
                onClick={() => setTipo('colombia')}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  tipo === 'colombia'
                    ? 'bg-green-600 text-white border-green-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Colombia
              </button>
            </div>
          </div>

          {/* Proveedor + Fecha */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                Proveedor
              </label>
              <input
                type="text"
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
                placeholder="Nombre del proveedor"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                Fecha
              </label>
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
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Total USD
                </label>
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
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  TRM (COP/USD)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={trm}
                  onChange={(e) => setTrm(e.target.value)}
                  placeholder="4200.00"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Total COP (calculado)
                </label>
                <div className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700">
                  {totalCopCalculado !== null ? formatCOP(totalCopCalculado) : '—'}
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-xs">
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                Total COP
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={totalCopDirecto}
                onChange={(e) => setTotalCopDirecto(e.target.value.replace(/\D/g, ''))}
                placeholder="0"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {totalCopFinal > 0 && (
                <p className="text-xs text-gray-400 mt-1">{formatCOP(totalCopFinal)}</p>
              )}
            </div>
          )}

          {/* Notas */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
              Notas (opcional)
            </label>
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
            <h2 className="text-sm font-semibold text-gray-900">
              Productos ({items.length})
            </h2>
            <button
              type="button"
              onClick={agregarItem}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              + Agregar producto
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.map((item, idx) => (
            <div key={idx} className="border border-gray-100 rounded-lg p-4 space-y-3 bg-gray-50">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Producto {idx + 1}
                </span>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => eliminarItem(idx)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
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
                    placeholder="Nike Air Max 95, pantalón cargo, etc."
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
                  <label className="block text-xs text-gray-500 mb-1">Costo unitario COP *</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={item.costo_unitario_cop}
                    onChange={(e) => actualizarItem(idx, 'costo_unitario_cop', e.target.value.replace(/\D/g, ''))}
                    placeholder="0"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                  {item.costo_unitario_cop && (
                    <p className="text-xs text-gray-400 mt-1">
                      {formatCOP(parseInt(item.costo_unitario_cop, 10) || 0)}
                    </p>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Destino</label>
                  <select
                    value={item.destino}
                    onChange={(e) => actualizarItem(idx, 'destino', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="sin_asignar">Sin asignar</option>
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
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Button
        onClick={handleConfirmar}
        disabled={isPending}
        size="md"
        className="w-full max-w-3xl"
      >
        {isPending ? 'Guardando compra...' : 'Confirmar y guardar compra'}
      </Button>
    </div>
  )
}
