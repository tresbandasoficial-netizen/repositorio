import { getCuadre } from '@/lib/queries/cuadre'
import { getSesion } from '@/lib/auth/acceso'
import { createClient } from '@/lib/supabase/server'
import { formatCOP, formatFecha, hoyBogota } from '@/lib/utils/format'
import { ESTADO_FACTURA_LABELS, ESTADO_FACTURA_COLORES, ESTADO_LABELS, ESTADO_COLORES, EstadoFactura, EstadoPedido } from '@/types'
import { CuadreFiltrosBar } from '@/components/cuadre/CuadreFiltrosBar'
import { CuadreDescargable } from '@/components/cuadre/CuadreDescargable'
import { ReabrirCajaButton } from '@/components/cuadre/ReabrirCajaButton'
import { CerrarCajaButton } from '@/components/dashboard/CerrarCajaButton'

export default async function CuadrePage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; sede?: string }>
}) {
  const sp = await searchParams
  const desde = sp.desde || hoyBogota()
  const hasta = sp.hasta || desde
  const sede = sp.sede || ''

  const [sesion, cuadre] = await Promise.all([
    getSesion(),
    getCuadre({ desde, hasta, sede: sede || undefined }),
  ])
  const esAdmin = sesion.rol === 'admin'

  const supabase = await createClient()
  const { data: sedes } = await supabase.from('sedes').select('id, codigo, nombre').order('codigo')

  const fechaHoy = hoyBogota()
  const cierreQuery = supabase.from('cierres_caja').select('id').eq('fecha', fechaHoy)
  if (sesion.sede_id) cierreQuery.eq('sede_id', sesion.sede_id)
  const { data: cierreHoy } = sesion.rol === 'admin' ? { data: null } : await cierreQuery.maybeSingle()

  // Admin: cajas cerradas hoy (para poder reabrirlas con un clic). El cierre
  // automático se reconoce por su nota.
  const { data: cierresHoyRaw } = esAdmin
    ? await supabase.from('cierres_caja').select('sede_id, notas').eq('fecha', fechaHoy)
    : { data: [] }
  const cierresHoy = ((cierresHoyRaw ?? []) as Array<{ sede_id: string; notas: string | null }>)
    .map(c => ({ sede_id: c.sede_id, automatico: (c.notas ?? '').toLowerCase().includes('autom') }))

  const params = new URLSearchParams({ desde, hasta, ...(sede ? { sede } : {}) })

  const multiSede = !sede
  const rangoLabel = desde === hasta ? formatFecha(desde) : `${formatFecha(desde)} – ${formatFecha(hasta)}`
  const sedeLabel = sede ? (sedes?.find(s => s.codigo === sede)?.nombre ?? sede) : 'Todas las sedes'
  const nombreArchivo = desde === hasta ? `cuadre-${desde}` : `cuadre-${desde}_a_${hasta}`

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

      {esAdmin && cierresHoy.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-4">
          {cierresHoy.map(c => {
            const s = sedes?.find(x => x.id === c.sede_id)
            return (
              <ReabrirCajaButton
                key={c.sede_id}
                sedeId={c.sede_id}
                sedeNombre={s?.nombre ?? 'Sede'}
                automatico={c.automatico}
              />
            )
          })}
        </div>
      )}

      <div className="mt-6">
      <CuadreDescargable nombreArchivo={nombreArchivo}>
      {/* Encabezado dentro de la imagen */}
      <div className="flex items-center justify-between mb-4 px-1">
        <div>
          <p className="text-base font-bold text-gray-900">Cuadre de caja</p>
          <p className="text-xs text-gray-500">{sedeLabel}</p>
        </div>
        <p className="text-xs text-gray-500">{rangoLabel}</p>
      </div>

      {/* Totales generales */}
      <div className={`grid grid-cols-2 ${esAdmin ? 'md:grid-cols-5' : 'md:grid-cols-3'} gap-3 mb-6`}>
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

      {/* Facturas emitidas en el rango */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-4">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-900">
            Facturas emitidas <span className="text-xs text-gray-400">({cuadre.facturas.length})</span>
          </p>
          <p className="text-xs text-gray-500">Total <span className="font-bold text-gray-900">{formatCOP(cuadre.totalFacturado)}</span></p>
        </div>
        {cuadre.facturas.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-400 text-center">No se emitieron facturas en este rango</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase">
                <th className="text-left px-5 py-2">N° factura</th>
                <th className="text-left px-3 py-2">Cliente</th>
                {multiSede && <th className="text-left px-3 py-2">Sede</th>}
                <th className="text-right px-3 py-2">Total</th>
                <th className="text-right px-3 py-2">Saldo</th>
                <th className="text-left px-5 py-2">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {cuadre.facturas.map(f => (
                <tr key={f.numero_factura}>
                  <td className="px-5 py-2 font-mono text-gray-900">{f.numero_factura}</td>
                  <td className="px-3 py-2 text-gray-700">{f.cliente_nombre}</td>
                  {multiSede && <td className="px-3 py-2 text-gray-500">{f.sede_codigo}</td>}
                  <td className="px-3 py-2 text-right font-medium text-gray-900">{formatCOP(f.total)}</td>
                  <td className={`px-3 py-2 text-right ${f.saldo > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCOP(f.saldo)}</td>
                  <td className="px-5 py-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${ESTADO_FACTURA_COLORES[f.estado as EstadoFactura] ?? 'bg-gray-100 text-gray-600'}`}>
                      {ESTADO_FACTURA_LABELS[f.estado as EstadoFactura] ?? f.estado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pedidos (encargos) creados en el rango */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-4">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-900">
            Pedidos vendidos <span className="text-xs text-gray-400">({cuadre.pedidos.length})</span>
          </p>
          <p className="text-xs text-gray-500">Total <span className="font-bold text-gray-900">{formatCOP(cuadre.totalPedidos)}</span></p>
        </div>
        {cuadre.pedidos.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-400 text-center">No se crearon pedidos en este rango</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase">
                <th className="text-left px-5 py-2">N° pedido</th>
                <th className="text-left px-3 py-2">Cliente</th>
                {multiSede && <th className="text-left px-3 py-2">Sede</th>}
                <th className="text-right px-3 py-2">Total</th>
                <th className="text-right px-3 py-2">Abonado</th>
                <th className="text-left px-5 py-2">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {cuadre.pedidos.map(p => (
                <tr key={p.numero_orden}>
                  <td className="px-5 py-2 font-mono text-gray-900">{p.numero_orden}</td>
                  <td className="px-3 py-2 text-gray-700">{p.cliente_nombre}</td>
                  {multiSede && <td className="px-3 py-2 text-gray-500">{p.sede_codigo}</td>}
                  <td className="px-3 py-2 text-right font-medium text-gray-900">{formatCOP(p.total)}</td>
                  <td className="px-3 py-2 text-right text-green-600">{formatCOP(p.abonado)}</td>
                  <td className="px-5 py-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${ESTADO_COLORES[p.estado as EstadoPedido] ?? 'bg-gray-100 text-gray-600'}`}>
                      {ESTADO_LABELS[p.estado as EstadoPedido] ?? p.estado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      </CuadreDescargable>
      </div>
    </div>
  )
}
