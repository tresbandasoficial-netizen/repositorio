'use client'

import { getDeudaMensajeriasAction } from '@/app/actions/gastos'
import { formatCOP } from '@/lib/utils/format'
import { useEffect, useState } from 'react'
import type { DeudaMensajeria } from '@/app/actions/gastos'

export function DeudaMensajeriasWidget() {
  const [deudas, setDeudas] = useState<DeudaMensajeria[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDeudaMensajeriasAction().then(setDeudas).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-sm text-gray-500">Cargando...</div>

  const totalDeuda = deudas.reduce((s, d) => s + d.saldo_pendiente, 0)
  const totalPagado = deudas.reduce((s, d) => s + d.pagado_acumulado, 0)

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">Deuda Mensajerías</h3>

      {deudas.length === 0 ? (
        <div className="text-center text-sm text-gray-500 py-4">Sin movimientos</div>
      ) : (
        <>
          <div className="space-y-3 mb-4">
            {deudas.map((m) => (
              <div key={m.mensajeria} className="border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-semibold text-gray-900">{m.mensajeria}</div>
                  <div className="text-xs font-medium text-gray-500">{m.domicilios_pendientes} domicilios</div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <div className="text-gray-500">Adeudado</div>
                    <div className={`font-semibold ${m.saldo_pendiente > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {formatCOP(m.saldo_pendiente)}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500">Pagado</div>
                    <div className="font-semibold text-green-600">{formatCOP(m.pagado_acumulado)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Total</div>
                    <div className="font-semibold text-blue-600">{formatCOP(m.total_movimiento)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-gray-200 pt-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total Pagado</span>
              <span className="font-semibold text-green-600">{formatCOP(totalPagado)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold bg-red-50 p-2 rounded">
              <span>Total Adeudado</span>
              <span className={totalDeuda > 0 ? 'text-red-600' : 'text-gray-400'}>{formatCOP(totalDeuda)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
