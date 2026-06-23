'use client'

import { useState, useTransition } from 'react'
import { cerrarCajaAction } from '@/app/actions/cierres'
import { getFlujoDiaAction } from '@/app/actions/gastos'
import { formatCOP } from '@/lib/utils/format'
import type { FlujoDia } from '@/app/actions/gastos'
import type { DetalleCuenta } from '@/app/actions/cierres'

export function CerrarCajaButton({ yaCerrada = false }: { yaCerrada?: boolean }) {
  const [open, setOpen] = useState(false)
  const [notas, setNotas] = useState('')
  const [flujo, setFlujo] = useState<FlujoDia[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  const [cerrado, setCerrado] = useState(yaCerrada)

  async function abrirModal() {
    setLoading(true)
    const data = await getFlujoDiaAction()
    setFlujo(data.filter(f => f.ingresos_hoy > 0 || f.egresos_hoy > 0))
    setLoading(false)
    setOpen(true)
  }

  function cerrar() {
    setOpen(false)
    setNotas('')
    setError('')
  }

  function handleConfirmar() {
    const detalle: DetalleCuenta[] = flujo.map(f => ({
      cuenta_id:     f.cuenta_id,
      cuenta_nombre: f.cuenta_nombre,
      tipo:          f.tipo,
      ingresos:      f.ingresos_hoy,
      egresos:       f.egresos_hoy,
      neto:          f.neto_hoy,
    }))
    const total_ingresos = flujo.reduce((s, f) => s + f.ingresos_hoy, 0)
    const total_egresos  = flujo.reduce((s, f) => s + f.egresos_hoy, 0)
    const neto           = total_ingresos - total_egresos

    start(async () => {
      const r = await cerrarCajaAction({ notas, detalle_cuentas: detalle, total_ingresos, total_egresos, neto })
      if (!r.ok) { setError(r.error); return }
      setCerrado(true)
      cerrar()
    })
  }

  if (cerrado) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 font-medium">
        ✓ Caja cerrada hoy
      </div>
    )
  }

  return (
    <>
      <button
        onClick={abrirModal}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
      >
        🔒 Cerrar Caja
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Cierre de Caja</h2>
              <p className="text-xs text-gray-500 mt-0.5">{new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>

            {/* Resumen del día */}
            <div className="px-6 py-4 space-y-3">
              {loading ? (
                <p className="text-sm text-gray-500 text-center py-4">Cargando movimientos...</p>
              ) : flujo.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">Sin movimientos registrados hoy</p>
              ) : (
                <>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Movimientos del día</p>
                  <div className="space-y-2">
                    {flujo.map(f => (
                      <div key={f.cuenta_id} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700">{f.cuenta_nombre}</span>
                        <div className="text-right">
                          {f.ingresos_hoy > 0 && <span className="text-green-600 text-xs mr-2">+{formatCOP(f.ingresos_hoy)}</span>}
                          {f.egresos_hoy > 0 && <span className="text-red-600 text-xs mr-2">-{formatCOP(f.egresos_hoy)}</span>}
                          <span className={`font-semibold ${f.neto_hoy >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                            {formatCOP(f.neto_hoy)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Totales */}
                  <div className="border-t border-gray-100 pt-3 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Total ingresos</span>
                      <span className="font-semibold text-green-600">+{formatCOP(flujo.reduce((s, f) => s + f.ingresos_hoy, 0))}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Total egresos</span>
                      <span className="font-semibold text-red-600">-{formatCOP(flujo.reduce((s, f) => s + f.egresos_hoy, 0))}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold bg-blue-50 px-2 py-1.5 rounded-lg mt-1">
                      <span>Neto del día</span>
                      <span className="text-blue-700">{formatCOP(flujo.reduce((s, f) => s + f.neto_hoy, 0))}</span>
                    </div>
                  </div>
                </>
              )}

              {/* Notas */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Observaciones <span className="font-normal text-gray-400">(diferencias, faltantes, sobrantes...)</span>
                </label>
                <textarea
                  value={notas}
                  onChange={e => setNotas(e.target.value)}
                  rows={3}
                  placeholder="Ej: Caja física $348.000, diferencia $2.000..."
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            {/* Acciones */}
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button
                onClick={cerrar}
                className="flex-1 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmar}
                disabled={pending || loading}
                className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {pending ? 'Cerrando...' : '🔒 Confirmar cierre'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
