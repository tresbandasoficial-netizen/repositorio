'use client'

import { getFlujoDiaAction } from '@/app/actions/gastos'
import { formatCOP } from '@/lib/utils/format'
import { useEffect, useState } from 'react'
import type { FlujoDia } from '@/app/actions/gastos'

export function FlujoDiaWidget() {
  const [flujo, setFlujo] = useState<FlujoDia[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getFlujoDiaAction().then(setFlujo).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-sm text-gray-500">Cargando...</div>

  const totalIngresos = flujo.reduce((s, f) => s + f.ingresos_hoy, 0)
  const totalEgresos = flujo.reduce((s, f) => s + f.egresos_hoy, 0)
  const neto = totalIngresos - totalEgresos

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">Flujo de Caja Hoy</h3>

      <div className="space-y-2 mb-4">
        {flujo.filter(f => f.ingresos_hoy > 0 || f.egresos_hoy > 0).map((f) => (
          <div key={f.cuenta_id} className="flex items-center justify-between text-sm">
            <div>
              <div className="font-medium text-gray-900">{f.cuenta_nombre}</div>
            </div>
            <div className="text-right space-y-1">
              {f.ingresos_hoy > 0 && <div className="text-green-600 text-xs">+{formatCOP(f.ingresos_hoy)}</div>}
              {f.egresos_hoy > 0 && <div className="text-red-600 text-xs">-{formatCOP(f.egresos_hoy)}</div>}
              <div className={`font-semibold ${f.neto_hoy >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {formatCOP(f.neto_hoy)}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-200 pt-3 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Ingresos</span>
          <span className="font-semibold text-green-600">+{formatCOP(totalIngresos)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Egresos</span>
          <span className="font-semibold text-red-600">-{formatCOP(totalEgresos)}</span>
        </div>
        <div className="flex justify-between text-sm font-bold bg-blue-50 p-2 rounded">
          <span>Neto Hoy</span>
          <span className={neto >= 0 ? 'text-green-600' : 'text-red-600'}>{formatCOP(neto)}</span>
        </div>
      </div>
    </div>
  )
}
