'use client'

import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { ReciboFactura } from '@/lib/queries/facturas'
import { formatCOP, formatFecha } from '@/lib/utils/format'
import { METODO_PAGO_LABELS, MetodoPago, ESTADO_FACTURA_LABELS } from '@/types'
import { Button } from '@/components/ui/Button'

export function ReciboFacturaView({ data }: { data: ReciboFactura }) {
  const { factura, sede_direccion, items, abonos } = data
  const ref = useRef<HTMLDivElement>(null)
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState('')

  async function generarPng(): Promise<{ dataUrl: string; blob: Blob } | null> {
    if (!ref.current) return null
    const dataUrl = await toPng(ref.current, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true })
    const blob = await (await fetch(dataUrl)).blob()
    return { dataUrl, blob }
  }

  async function descargar() {
    setError(''); setGenerando(true)
    try {
      const res = await generarPng()
      if (!res) return
      const a = document.createElement('a')
      a.href = res.dataUrl
      a.download = `${factura.numero_factura}.png`
      a.click()
    } catch {
      setError('No se pudo generar la imagen. Intenta de nuevo.')
    } finally {
      setGenerando(false)
    }
  }

  async function compartir() {
    setError(''); setGenerando(true)
    try {
      const res = await generarPng()
      if (!res) return
      const file = new File([res.blob], `${factura.numero_factura}.png`, { type: 'image/png' })
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean; share?: (d: unknown) => Promise<void> }
      if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
        await nav.share({ files: [file], title: factura.numero_factura, text: `Factura ${factura.numero_factura} - Tres Bandas` })
      } else {
        // Sin soporte para compartir: descarga como alternativa.
        const a = document.createElement('a')
        a.href = res.dataUrl
        a.download = `${factura.numero_factura}.png`
        a.click()
      }
    } catch {
      setError('No se pudo compartir. Usa "Descargar" e intenta enviarla manual.')
    } finally {
      setGenerando(false)
    }
  }

  return (
    <div>
      {/* Botones */}
      <div className="flex gap-2 mb-4">
        <Button onClick={compartir} disabled={generando} className="flex-1">
          {generando ? 'Generando…' : '📤 Compartir imagen'}
        </Button>
        <Button onClick={descargar} variant="secondary" disabled={generando}>⬇ Descargar</Button>
      </div>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {/* Recibo (esto es lo que se convierte en imagen) */}
      <div ref={ref} className="bg-white p-6" style={{ fontFamily: 'system-ui, sans-serif' }}>
        {/* Encabezado */}
        <div className="text-center border-b border-gray-200 pb-4 mb-4">
          <p className="text-2xl font-black tracking-tight text-gray-900">TRES BANDAS</p>
          <p className="text-xs text-gray-500 mt-0.5">{factura.sede_nombre}</p>
          {sede_direccion && <p className="text-xs text-gray-400">{sede_direccion}</p>}
        </div>

        {/* Datos factura */}
        <div className="flex justify-between text-sm mb-1">
          <span className="text-gray-500">Factura</span>
          <span className="font-bold text-gray-900 font-mono">{factura.numero_factura}</span>
        </div>
        <div className="flex justify-between text-sm mb-1">
          <span className="text-gray-500">Fecha</span>
          <span className="text-gray-800">{formatFecha(factura.fecha_factura)}</span>
        </div>
        <div className="flex justify-between text-sm mb-1">
          <span className="text-gray-500">Cliente</span>
          <span className="text-gray-800">{factura.cliente_nombre}</span>
        </div>
        <div className="flex justify-between text-sm mb-4">
          <span className="text-gray-500">Teléfono</span>
          <span className="text-gray-800">{factura.cliente_telefono}</span>
        </div>

        {/* Items */}
        <table className="w-full text-sm mb-4">
          <thead>
            <tr className="border-y border-gray-200 text-xs text-gray-500">
              <th className="text-left py-1.5">Producto</th>
              <th className="text-center py-1.5">Cant</th>
              <th className="text-right py-1.5">Valor</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-b border-gray-50">
                <td className="py-1.5 text-gray-800">
                  {it.marca} {it.descripcion}{it.talla ? ` · T${it.talla}` : ''}
                </td>
                <td className="py-1.5 text-center text-gray-600">{it.cantidad}</td>
                <td className="py-1.5 text-right text-gray-800">{formatCOP(it.precio_venta * it.cantidad)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totales */}
        <div className="border-t border-gray-200 pt-3 space-y-1">
          {(factura.envio > 0 || factura.descuento > 0) && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Subtotal</span>
              <span className="text-gray-800">{formatCOP(factura.subtotal)}</span>
            </div>
          )}
          {factura.envio > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Envío</span>
              <span className="text-gray-800">{formatCOP(factura.envio)}</span>
            </div>
          )}
          {factura.descuento > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Descuento</span>
              <span className="text-gray-800">-{formatCOP(factura.descuento)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Total</span>
            <span className="font-bold text-gray-900">{formatCOP(factura.total)}</span>
          </div>
          {factura.total_abonado > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Abonado</span>
              <span className="text-green-600 font-medium">{formatCOP(factura.total_abonado)}</span>
            </div>
          )}
          <div className="flex justify-between text-base pt-1">
            <span className="font-bold text-gray-900">Saldo</span>
            <span className="font-black text-gray-900">{formatCOP(factura.saldo)}</span>
          </div>
        </div>

        {/* Pagos */}
        {abonos.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-1">Pagos</p>
            {abonos.map((a, i) => (
              <div key={i} className="flex justify-between text-xs text-gray-600">
                <span>{formatFecha(a.fecha)} · {METODO_PAGO_LABELS[a.metodo as MetodoPago] ?? a.metodo}</span>
                <span>{formatCOP(a.monto)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Estado / vencimiento */}
        <div className="mt-4 pt-3 border-t border-gray-200 text-center">
          {factura.saldo > 0 ? (
            <p className="text-xs text-gray-500">
              Saldo pendiente · vence el <span className="font-medium text-gray-700">{formatFecha(factura.fecha_vencimiento)}</span>
            </p>
          ) : (
            <p className="text-sm font-bold text-green-600">✓ {ESTADO_FACTURA_LABELS[factura.estado]}</p>
          )}
          <p className="text-xs text-gray-400 mt-2">¡Gracias por tu compra!</p>
        </div>
      </div>
    </div>
  )
}
