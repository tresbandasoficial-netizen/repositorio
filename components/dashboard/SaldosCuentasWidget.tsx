'use client'

import { getSaldosCuentasAction } from '@/app/actions/gastos'
import { formatCOP } from '@/lib/utils/format'
import { useEffect, useState } from 'react'
import type { SaldoCuenta } from '@/app/actions/gastos'

export function SaldosCuentasWidget() {
  const [saldos, setSaldos] = useState<SaldoCuenta[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getSaldosCuentasAction().then(setSaldos).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-sm text-gray-500">Cargando...</div>

  const totalNeto = saldos.reduce((s, c) => s + c.saldo_neto, 0)

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">Saldos Disponibles</h3>

      <div className="space-y-3 mb-4">
        {saldos.map((cuenta) => (
          <div key={cuenta.id} className="flex items-center justify-between text-sm">
            <div>
              <div className="font-medium text-gray-900">{cuenta.nombre}</div>
              <div className="text-xs text-gray-500">
                {cuenta.tipo === 'banco' ? '🏦' : cuenta.tipo === 'billetera' ? '📱' : '💰'} {cuenta.tipo}
              </div>
            </div>
            <div className="text-right">
              <div className={`font-semibold ${cuenta.saldo_neto >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCOP(cuenta.saldo_neto)}
              </div>
              <div className="text-xs text-gray-500">
                +{formatCOP(cuenta.total_ingresos)} / -{formatCOP(cuenta.total_egresos)}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-200 pt-3 flex justify-between">
        <span className="font-semibold text-gray-900">Total Disponible</span>
        <span className={`font-bold text-lg ${totalNeto >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {formatCOP(totalNeto)}
        </span>
      </div>
    </div>
  )
}
