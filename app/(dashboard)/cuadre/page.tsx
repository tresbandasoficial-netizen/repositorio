import { getCuadre } from '@/lib/queries/cuadre'
import { getSesion } from '@/lib/auth/acceso'
import { createClient } from '@/lib/supabase/server'
import { formatCOP } from '@/lib/utils/format'
import { CuadreFiltrosBar } from '@/components/cuadre/CuadreFiltrosBar'
import { CerrarCajaButton } from '@/components/dashboard/CerrarCajaButton'

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
  const esAdmin = sesion.rol === 'admin'

  const supabase = await createClient()
  const { data: sedes } = await supabase.from('sedes').select('id, codigo, nombre').order('codigo')

  const fechaHoy = new Date().toISOString().slice(0, 10)
  const cierreQuery = supabase.from('cierres_caja').select('id').eq('fecha', fechaHoy)
  if (sesion.sede_id) cierreQuery.eq('sede_id', sesion.sede_id)
  const { data: cierreHoy } = sesion.rol === 'admin' ? { data: null } : await cierreQuery.maybeSingle()

  const params = new URLSearchParams({ desde, hasta, ...(sede ? { sede } : {}) })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Cuadre de caja</h1>
          <p className="text-sm text-gray-500 mt-0.5">Lo vendido, recaudado y gastos de cada sede</p>
        </div>
        <div className="flex items-center gap-3">
          <CerrarCajaButton
            yaCerrada={!!cierreHoy}
            sedes={sesion.rol === 'admin' ? (sedes ?? []).map(s => ({ id: s.id, nombre: s.nombre, codigo: s.codigo })) : undefined}
          />
          <a
            href={`/api/export/cuadre?${params.toString()}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 text-white px-4 py-2 text-sm font-medium hover:bg-green-700"
          >
            ⬇ Exportar Excel
          </a>
        </div>
      </div>

      <CuadreFiltrosBar
        desde={desde}
        hasta={hasta}
        sede={sede}
        sedes={(sedes ?? []) as { id: string; codigo: string; nombre: string }[]}
        esAdmin={esAdmin}
      />

      {/* Totales generales */}
      <div className={`grid grid-cols-2 ${esAdmin ? 'md:grid-cols-5' : 'md:grid-cols-3'} gap-3 my-6`}>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase">Vendido</p>
          <p className="text-base font-bold text-gray-900 mt-1">{formatCOP(cuadre.totalVendido)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase">Recaudado en caja</p>
          <p className="text-base font-bold text-green-600 mt-1">{formatCOP(cuadre.totalRecaudadoCaja)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase">Por cobrar mensajería</p>
          <p className="text-base font-bold text-amber-600 mt-1">{formatCOP(cuadre.totalPorCobrarMensajeria)}</p>
        </div>
        {esAdmin && (
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-500 uppercase">Gastos</p>
            <p className="text-base font-bold text-red-600 mt-1">{formatCOP(cuadre.totalGastos)}</p>
          </div>
        )}
        {esAdmin && (
          <div className="bg-blue-600 rounded-xl p-4">
            <p className="text-xs text-blue-100 uppercase">Neto en caja</p>
            <p className="text-lg font-bold text-white mt-1">{formatCOP(cuadre.totalNetoCaja)}</p>
          </div>
        )}
      </div>

      {cuadre.sedes.length === 0 ? (
        <div className="text-center py-16 text-gray-400">No hay movimiento en este rango</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {cuadre.sedes.map(s => (
            <div key={s.sede_codigo} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900">
                  {s.sede_nombre} <span className="text-xs text-gray-400">({s.sede_codigo})</span>
                </p>
                <p className="text-xs text-gray-500">Vendido <span className="font-bold text-gray-900">{formatCOP(s.vendido)}</span></p>
              </div>

              {/* Resumen de la sede */}
              <div className="grid grid-cols-2 gap-px bg-gray-100">
                <div className="bg-white px-5 py-3">
                  <p className="text-[11px] text-gray-500 uppercase">Recaudado en caja</p>
                  <p className="text-sm font-bold text-green-600">{formatCOP(s.recaudadoCaja)}</p>
                </div>
                <div className="bg-white px-5 py-3">
                  <p className="text-[11px] text-gray-500 uppercase">Por cobrar mensajería</p>
                  <p className="text-sm font-bold text-amber-600">{formatCOP(s.porCobrarMensajeria)}</p>
                </div>
                <div className="bg-white px-5 py-3">
                  <p className="text-[11px] text-gray-500 uppercase">A crédito</p>
                  <p className="text-sm font-bold text-gray-700">{formatCOP(s.credito)}</p>
                </div>
                {esAdmin && (
                  <div className="bg-white px-5 py-3">
                    <p className="text-[11px] text-gray-500 uppercase">Gastos</p>
                    <p className="text-sm font-bold text-red-600">{formatCOP(s.gastos)}</p>
                  </div>
                )}
                {esAdmin && (
                  <div className="bg-white px-5 py-3 col-span-2 border-t border-gray-100">
                    <p className="text-[11px] text-gray-500 uppercase">Neto en caja (recaudado − gastos)</p>
                    <p className={`text-sm font-bold ${s.netoCaja >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{formatCOP(s.netoCaja)}</p>
                  </div>
                )}
              </div>

              {/* Por método */}
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase">
                    <th className="text-left px-5 py-2">Método</th>
                    <th className="text-right px-5 py-2">Recaudado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {s.porMetodo.map(m => (
                    <tr key={m.metodo} className={m.monto === 0 ? 'text-gray-400' : ''}>
                      <td className="px-5 py-2">
                        {m.label}
                        {m.tipo === 'mensajeria' && <span className="ml-1.5 text-[10px] text-amber-600">por cobrar</span>}
                        {m.tipo === 'credito' && <span className="ml-1.5 text-[10px] text-gray-400">a crédito</span>}
                        {!m.esperado && m.monto > 0 && <span className="ml-1.5 text-[10px] text-purple-500">no esperado</span>}
                      </td>
                      <td className="px-5 py-2 text-right font-medium text-gray-900">{m.monto ? formatCOP(m.monto) : '—'}</td>
                    </tr>
                  ))}
                  {s.porMetodo.length === 0 && (
                    <tr><td colSpan={2} className="px-5 py-3 text-gray-400 text-center">Sin recaudo</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* Por asesor */}
      {cuadre.porAsesor.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-4">
          <div className="px-5 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900">Recaudo en caja por asesor</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase">
                <th className="text-left px-5 py-2">Asesor</th>
                <th className="text-right px-5 py-2">Recaudado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {cuadre.porAsesor.map(a => (
                <tr key={a.asesor_id}>
                  <td className="px-5 py-2.5 text-gray-800">{a.asesor_nombre}</td>
                  <td className="px-5 py-2.5 text-right font-semibold text-gray-900">{formatCOP(a.recaudadoCaja)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
