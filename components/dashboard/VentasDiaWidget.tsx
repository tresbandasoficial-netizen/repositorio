'use client'

import { getVentasDiaAction } from '@/app/actions/gastos'
import { formatCOP } from '@/lib/utils/format'
import { useEffect, useState } from 'react'
import type { VentaDia } from '@/app/actions/gastos'

export function VentasDiaWidget() {
  const [ventas, setVentas] = useState<VentaDia[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getVentasDiaAction().then(setVentas).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-sm text-gray-500">Cargando...</div>

  const totalFacturado = ventas.reduce((s, v) => s + v.total_facturado, 0)
  const totalRecaudado = ventas.reduce((s, v) => s + v.total_recaudado, 0)
  const totalPendiente = ventas.reduce((s, v) => s + v.saldo_pendiente, 0)
  const totalFacturas = ventas.reduce((s, v) => s + v.num_facturas, 0)

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">Ventas y Recaudación Hoy</h3>

      <div className="space-y-4 mb-4">
        {ventas.map((sede) => (
          <div key={sede.sede_id} className="border-b border-gray-100 pb-3 last:border-0 last:pb-0">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-gray-900">{sede.sede_nombre}</div>
              <div className="text-xs font-medium text-gray-500">{sede.num_facturas} facturas</div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <div className="text-gray-500">Facturado</div>
                <div className="font-semibold text-blue-600">{formatCOP(sede.total_facturado)}</div>
              </div>
              <div>
                <div className="text-gray-500">Recaudado</div>
                <div className="font-semibold text-green-600">{formatCOP(sede.total_recaudado)}</div>
              </div>
              <div>
                <div className="text-gray-500">Pendiente</div>
                <div className={`font-semibold ${sede.saldo_pendiente > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                  {formatCOP(sede.saldo_pendiente)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {ventas.length > 0 && (
        <div className="border-t border-gray-200 pt-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">{totalFacturas} facturas</span>
            <span className="font-semibold">Hoy</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Total Facturado</span>
            <span className="font-semibold text-blue-600">{formatCOP(totalFacturado)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Total Recaudado</span>
            <span className="font-semibold text-green-600">{formatCOP(totalRecaudado)}</span>
          </div>
          <div className="flex justify-between text-sm font-bold bg-amber-50 p-2 rounded">
            <span>Por Cobrar</span>
            <span className={totalPendiente > 0 ? 'text-red-600' : 'text-gray-400'}>{formatCOP(totalPendiente)}</span>
          </div>
        </div>
      )}

      {ventas.length === 0 && (
        <div className="text-center text-sm text-gray-500 py-4">
          Sin ventas hoy
        </div>
      )}
    </div>
  )
}
