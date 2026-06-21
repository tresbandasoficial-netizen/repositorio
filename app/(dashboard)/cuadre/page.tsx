import { getCuadre } from '@/lib/queries/cuadre'
import { getSesion } from '@/lib/auth/acceso'
import { createClient } from '@/lib/supabase/server'
import { formatCOP } from '@/lib/utils/format'
import { METODO_PAGO_LABELS } from '@/types'
import { CuadreFiltrosBar } from '@/components/cuadre/CuadreFiltrosBar'

function hoy() { return new Date().toISOString().slice(0, 10) }

export default async function CuadrePage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; sede?: string }>
}) {
  const sp = await searchParams
  const desde = sp.desde || hoy()
  const hasta = sp.hasta || desde
  const sede = sp.sede || ''

  const [sesion, cuadre] = await Promise.all([
    getSesion(),
    getCuadre({ desde, hasta, sede: sede || undefined }),
  ])

  const supabase = await createClient()
  const { data: sedes } = await supabase.from('sedes').select('codigo, nombre').order('codigo')

  const params = new URLSearchParams({ desde, hasta, ...(sede ? { sede } : {}) })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Cuadre de caja</h1>
          <p className="text-sm text-gray-500 mt-0.5">Recaudo por método de pago, sede y asesor</p>
        </div>
        <a
          href={`/api/export/cuadre?${params.toString()}`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 text-white px-4 py-2 text-sm font-medium hover:bg-green-700"
        >
          ⬇ Exportar Excel
        </a>
      </div>

      <CuadreFiltrosBar
        desde={desde}
        hasta={hasta}
        sede={sede}
        sedes={(sedes ?? []) as { codigo: string; nombre: string }[]}
        esAdmin={sesion.rol === 'admin'}
      />

      {/* Totales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-6">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase">Ventas</p>
          <p className="text-base font-bold text-gray-900 mt-1">{formatCOP(cuadre.totalVenta)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase">Abonos</p>
          <p className="text-base font-bold text-gray-900 mt-1">{formatCOP(cuadre.totalAbono)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase">Cartera</p>
          <p className="text-base font-bold text-gray-900 mt-1">{formatCOP(cuadre.totalCartera)}</p>
        </div>
        <div className="bg-blue-600 rounded-xl p-4">
          <p className="text-xs text-blue-100 uppercase">Total recaudado</p>
          <p className="text-lg font-bold text-white mt-1">{formatCOP(cuadre.totalGeneral)}</p>
        </div>
      </div>

      {cuadre.registros === 0 ? (
        <div className="text-center py-16 text-gray-400">No hay recaudos en este rango</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Por método */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100"><p className="text-sm font-semibold text-gray-900">Por método de pago</p></div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase">
                  <th className="text-left px-5 py-2">Método</th>
                  <th className="text-right px-3 py-2">Ventas</th>
                  <th className="text-right px-3 py-2">Abonos</th>
                  <th className="text-right px-3 py-2">Cartera</th>
                  <th className="text-right px-5 py-2">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {cuadre.porMetodo.map(m => (
                  <tr key={m.metodo}>
                    <td className="px-5 py-2.5 font-medium text-gray-800">{METODO_PAGO_LABELS[m.metodo]}</td>
                    <td className="px-3 py-2.5 text-right text-gray-500">{m.venta ? formatCOP(m.venta) : '—'}</td>
                    <td className="px-3 py-2.5 text-right text-gray-500">{m.abono ? formatCOP(m.abono) : '—'}</td>
                    <td className="px-3 py-2.5 text-right text-gray-500">{m.cartera ? formatCOP(m.cartera) : '—'}</td>
                    <td className="px-5 py-2.5 text-right font-semibold text-gray-900">{formatCOP(m.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50 font-bold">
                  <td className="px-5 py-2.5 text-gray-900">Total</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{formatCOP(cuadre.totalVenta)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{formatCOP(cuadre.totalAbono)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{formatCOP(cuadre.totalCartera)}</td>
                  <td className="px-5 py-2.5 text-right text-gray-900">{formatCOP(cuadre.totalGeneral)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Por asesor + por sede */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100"><p className="text-sm font-semibold text-gray-900">Por asesor</p></div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-50">
                  {cuadre.porAsesor.map(a => (
                    <tr key={a.asesor_id}>
                      <td className="px-5 py-2.5 text-gray-800">{a.asesor_nombre}</td>
                      <td className="px-5 py-2.5 text-right font-semibold text-gray-900">{formatCOP(a.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {cuadre.porSede.length > 1 && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100"><p className="text-sm font-semibold text-gray-900">Consolidado por sede</p></div>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-50">
                    {cuadre.porSede.map(s => (
                      <tr key={s.sede_codigo}>
                        <td className="px-5 py-2.5 text-gray-800">{s.sede_nombre} <span className="text-xs text-gray-400">({s.sede_codigo})</span></td>
                        <td className="px-5 py-2.5 text-right font-semibold text-gray-900">{formatCOP(s.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
