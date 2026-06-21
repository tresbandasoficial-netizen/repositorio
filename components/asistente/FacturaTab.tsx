'use client'

import { useState, useTransition, useRef } from 'react'
import { parsearFacturaAction } from '@/app/actions/parsear-factura'
import { crearCompraAction, CompraItemInput } from '@/app/actions/compras'
import { formatCOP } from '@/lib/utils/format'

type Fase = 'subir' | 'revisar' | 'exito'

type ItemForm = {
  descripcion: string
  marca: string
  talla: string
  costo_cop: string
  precio_original: number
}

export function FacturaTab() {
  const [fase, setFase] = useState<Fase>('subir')
  const [tipo, setTipo] = useState<'colombia' | 'usa'>('colombia')
  const [proveedor, setProveedor] = useState('')
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [numeroFactura, setNumeroFactura] = useState('')
  const [totalCop, setTotalCop] = useState('')
  const [totalUsd, setTotalUsd] = useState('')
  const [notas, setNotas] = useState('')
  const [items, setItems] = useState<ItemForm[]>([])
  const [error, setError] = useState<string | null>(null)
  const [compraId, setCompraId] = useState<string | null>(null)
  const [isParsing, startParsing] = useTransition()
  const [isSaving, startSaving] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  const totalCopNum = parseInt(totalCop.replace(/\D/g, ''), 10) || 0
  const trmCalc =
    tipo === 'usa' && totalUsd && totalCop
      ? Math.round(totalCopNum / parseFloat(totalUsd))
      : null

  function processFile(file: File) {
    setError(null)
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowed.includes(file.type)) {
      setError('Tipo no soportado. Usa JPG, PNG, WebP o PDF.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const b64 = (reader.result as string).split(',')[1]
      const mt = file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'
      startParsing(async () => {
        const result = await parsearFacturaAction(b64, mt, tipo)
        if (!result.ok) { setError(result.error); return }
        const d = result.data
        setProveedor(d.proveedor || '')
        setFecha(d.fecha || new Date().toISOString().slice(0, 10))
        setNumeroFactura(d.numero_factura || '')
        if (tipo === 'colombia') {
          setTotalCop(String(Math.round(d.total_usd)))
          setTotalUsd('')
        } else {
          setTotalUsd(String(d.total_usd))
          setTotalCop('')
        }
        const expanded: ItemForm[] = []
        for (const item of d.items) {
          const qty = Math.max(item.cantidad || 1, 1)
          const unitPrice = (item.precio_usd ?? 0) / qty
          for (let i = 0; i < qty; i++) {
            expanded.push({
              descripcion: item.descripcion || '',
              marca: item.marca || '',
              talla: item.talla || '',
              precio_original: unitPrice,
              costo_cop: tipo === 'colombia' ? String(Math.round(unitPrice)) : '',
            })
          }
        }
        setItems(expanded)
        setFase('revisar')
      })
    }
    reader.readAsDataURL(file)
  }

  function recalcCop() {
    if (!trmCalc) return
    setItems(prev => prev.map(it => ({
      ...it,
      costo_cop: it.precio_original ? String(Math.round(it.precio_original * trmCalc)) : it.costo_cop,
    })))
  }

  function resetForm() {
    setFase('subir')
    setProveedor('')
    setFecha(new Date().toISOString().slice(0, 10))
    setNumeroFactura('')
    setTotalCop('')
    setTotalUsd('')
    setNotas('')
    setItems([])
    setError(null)
    setCompraId(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleGuardar() {
    setError(null)
    if (!proveedor.trim()) { setError('El proveedor es obligatorio'); return }
    if (totalCopNum <= 0) { setError('El total en COP es obligatorio'); return }
    if (tipo === 'usa' && (!totalUsd || parseFloat(totalUsd) <= 0)) {
      setError('El total en USD es obligatorio'); return
    }
    for (let i = 0; i < items.length; i++) {
      if (!items[i].descripcion.trim()) { setError(`Producto ${i + 1}: falta la descripción`); return }
    }
    const itemsInput: CompraItemInput[] = items.map(it => ({
      descripcion: it.descripcion.trim(),
      marca: it.marca.trim(),
      talla: it.talla.trim(),
      cantidad: 1,
      costo_unitario_cop: parseInt(it.costo_cop.replace(/\D/g, ''), 10) || 0,
      destino: 'sin_asignar' as const,
    }))
    startSaving(async () => {
      const result = await crearCompraAction({
        tipo,
        proveedor: proveedor.trim(),
        fecha,
        numero_factura: numeroFactura.trim(),
        total_usd: tipo === 'usa' ? parseFloat(totalUsd) : null,
        trm: tipo === 'usa' ? trmCalc : null,
        total_cop: totalCopNum,
        notas,
        items: itemsInput,
      })
      if (!result.ok) { setError(result.error); return }
      setCompraId(result.compraId)
      setFase('exito')
    })
  }

  function updateItem(idx: number, field: keyof ItemForm, val: string) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it))
  }

  // ── Success ──────────────────────────────────────────────────────────────────
  if (fase === 'exito') {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-4 text-center">
        <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center">
          <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <p className="font-bold text-gray-900">¡Compra registrada!</p>
          <p className="text-sm text-gray-500 mt-1">La factura fue subida correctamente al sistema.</p>
        </div>
        <div className="flex gap-3">
          {compraId && (
            <a href={`/compras/${compraId}`}
              className="text-sm text-blue-600 border border-blue-200 rounded-xl px-4 py-2 hover:bg-blue-50 transition-colors">
              Ver compra →
            </a>
          )}
          <button type="button" onClick={resetForm}
            className="text-sm text-gray-600 border border-gray-200 rounded-xl px-4 py-2 hover:bg-gray-50 transition-colors">
            Subir otra
          </button>
        </div>
      </div>
    )
  }

  // ── Upload ───────────────────────────────────────────────────────────────────
  if (fase === 'subir') {
    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          {(['colombia', 'usa'] as const).map(t => (
            <button key={t} type="button" onClick={() => setTipo(t)}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${
                tipo === t
                  ? t === 'colombia' ? 'bg-green-600 text-white border-green-600' : 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}>
              {t === 'colombia' ? '🇨🇴 Pesos (COP)' : '🇺🇸 Dólares (USD)'}
            </button>
          ))}
        </div>

        <label
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) processFile(f) }}
          className={`flex flex-col items-center gap-3 border-2 border-dashed rounded-2xl p-10 cursor-pointer transition-colors ${
            isParsing ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:border-blue-400 hover:bg-gray-50'
          }`}>
          <input ref={fileRef} type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f) }}
            disabled={isParsing} className="hidden" />
          {isParsing ? (
            <>
              <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-blue-600 font-medium">Leyendo factura con IA…</p>
            </>
          ) : (
            <>
              <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-700">Sube la factura del proveedor</p>
                <p className="text-xs text-gray-400 mt-1">JPG, PNG, WebP o PDF · Arrastra o haz clic</p>
              </div>
            </>
          )}
        </label>

        {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}
      </div>
    )
  }

  // ── Review ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <button type="button" onClick={() => { setFase('subir'); setError(null) }}
        className="text-xs text-blue-600 hover:text-blue-800">
        ← Subir otra factura
      </button>

      {/* Datos */}
      <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Datos de la factura</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Proveedor *</label>
            <input type="text" value={proveedor} onChange={e => setProveedor(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">N° Factura</label>
            <input type="text" value={numeroFactura} onChange={e => setNumeroFactura(e.target.value)}
              placeholder="opcional"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Fecha</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          </div>
          {tipo === 'usa' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Total USD *</label>
              <input type="number" value={totalUsd} onChange={e => setTotalUsd(e.target.value)} min="0" step="0.01"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              {tipo === 'usa' ? 'Total COP pagado *' : 'Total COP *'}
            </label>
            <input type="text" inputMode="numeric" value={totalCop}
              onChange={e => setTotalCop(e.target.value.replace(/\D/g, ''))}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
            {totalCopNum > 0 && <p className="text-xs text-gray-400 mt-0.5">{formatCOP(totalCopNum)}</p>}
          </div>
        </div>
        {tipo === 'usa' && trmCalc && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">TRM: <span className="font-semibold">${trmCalc.toLocaleString('es-CO')}</span></p>
            <button type="button" onClick={recalcCop}
              className="text-xs text-blue-600 border border-blue-200 rounded-lg px-3 py-1 hover:bg-blue-50">
              ↺ Recalcular costos COP
            </button>
          </div>
        )}
      </div>

      {/* Items */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Productos ({items.length})</p>
          <button type="button"
            onClick={() => setItems(p => [...p, { descripcion: '', marca: '', talla: '', costo_cop: '', precio_original: 0 }])}
            className="text-xs text-blue-600 hover:text-blue-800">
            + Agregar
          </button>
        </div>
        {items.map((item, idx) => (
          <div key={idx} className="bg-gray-50 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-400">#{idx + 1}</span>
              {items.length > 1 && (
                <button type="button" onClick={() => setItems(p => p.filter((_, i) => i !== idx))}
                  className="text-xs text-red-500 hover:text-red-700">Eliminar</button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <input type="text" value={item.descripcion}
                  onChange={e => updateItem(idx, 'descripcion', e.target.value)}
                  placeholder="Descripción *"
                  className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
              </div>
              <input type="text" value={item.marca}
                onChange={e => updateItem(idx, 'marca', e.target.value)}
                placeholder="Marca"
                className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
              <input type="text" value={item.talla}
                onChange={e => updateItem(idx, 'talla', e.target.value)}
                placeholder="Talla"
                className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
              <div className="col-span-2">
                <input type="text" inputMode="numeric" value={item.costo_cop}
                  onChange={e => updateItem(idx, 'costo_cop', e.target.value.replace(/\D/g, ''))}
                  placeholder="Costo unitario COP"
                  className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <textarea value={notas} onChange={e => setNotas(e.target.value)}
        rows={2} placeholder="Notas (opcional)"
        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />

      {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}

      <button type="button" onClick={handleGuardar} disabled={isSaving}
        className="w-full h-11 rounded-2xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 transition-colors">
        {isSaving ? 'Guardando compra…' : 'Registrar compra'}
      </button>
    </div>
  )
}
