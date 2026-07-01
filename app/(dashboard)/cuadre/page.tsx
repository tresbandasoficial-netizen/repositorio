import { getCuadre, getSaldosCuentas, getGastosAcumulado, type SaldoCuenta } from '@/lib/queries/cuadre'
import { getSesion } from '@/lib/auth/acceso'
import { createClient } from '@/lib/supabase/server'
import { formatCOP, formatFecha, hoyBogota } from '@/lib/utils/format'
import { ESTADO_FACTURA_LABELS, ESTADO_FACTURA_COLORES, ESTADO_LABELS, ESTADO_COLORES, EstadoFactura, EstadoPedido, CATEGORIA_GASTO_LABELS, CategoriaGasto } from '@/types'
import { CuadreFiltrosBar } from '@/components/cuadre/CuadreFiltrosBar'
import { CuadreDescargable } from '@/components/cuadre/CuadreDescargable'
import { MetodosCuadre } from '@/components/cuadre/MetodosCuadre'
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

  const [sesion, cuadre, saldosCuentas, gastosAcumulado] = await Promise.all([
    getSesion(),
    getCuadre({ desde, hasta, sede: sede || undefined }),
    getSaldosCuentas(sede || undefined, { desde, hasta }),
    getGastosAcumulado(sede || undefined),
  ])
  const esAdmin = sesion.rol === 'admin'
  // Mostrar: efectivo siempre; y las cuentas que tuvieron movimiento en el rango
  // o cuyo acumulado es visible y no es cero.
  const cuentasVisibles = saldosCuentas.filter(c => c.es_efectivo || c.hoy !== 0 || (c.verTotal && c.total !== 0))
  const efectivoCajas  = cuentasVisibles.filter(c => c.es_efectivo)
  const cuentasBanco   = cuentasVisibles.filter(c => !c.es_efectivo)
  const totalEfectivo  = efectivoCajas.reduce((s, c) => s + c.total, 0)
  const totalCuentas   = cuentasBanco.filter(c => c.verTotal).reduce((s, c) => s + c.total, 0)
  const recogidoHoy    = cuentasVisibles.reduce((s, c) => s + c.hoy, 0)
  const labelDia       = desde === hasta ? 'Hoy' : 'Período'
  const totalGastosRango = cuadre.gastosDetalle.reduce((s, g) => s + g.valor, 0)

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

      {/* Dinero recogido (del día) y acumulado (total) por cuenta.
          Hoy = lo que entró en el rango. Total = base + hoy (acumulado). */}
      {cuentasVisibles.length > 0 && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-xs text-gray-500 uppercase font-semibold tracking-wide">Dinero por cuenta</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {labelDia} = lo recogido · Total = acumulado (base + {labelDia.toLowerCase()})
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-gray-400 uppercase">{labelDia} recogido</p>
              <p className="text-2xl font-bold text-gray-900">{formatCOP(recogidoHoy)}</p>
            </div>
          </div>

          {/* Subtotales acumulados */}
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-2.5">
              <p className="text-[11px] text-green-700 uppercase">Efectivo (total)</p>
              <p className="text-lg font-bold text-green-800">{formatCOP(totalEfectivo)}</p>
            </div>
            {cuentasBanco.some(c => c.verTotal) && (
              <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-2.5">
                <p className="text-[11px] text-blue-700 uppercase">Cuentas (total)</p>
                <p className="text-lg font-bold text-blue-800">{formatCOP(totalCuentas)}</p>
              </div>
            )}
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2.5">
              <p className="text-[11px] text-red-700 uppercase">Gastos acumulados</p>
              <p className="text-lg font-bold text-red-800">{formatCOP(gastosAcumulado)}</p>
              <p className="text-[10px] text-red-500">todos los días</p>
            </div>
          </div>

          {/* Efectivo */}
          {efectivoCajas.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] text-gray-400 uppercase font-semibold mb-1.5">Efectivo</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {efectivoCajas.map(c => <FilaCuenta key={c.cuenta_id} c={c} labelDia={labelDia} verde />)}
              </div>
            </div>
          )}

          {/* Cuentas (Nequi, Bancolombia, Daviplata…) */}
          {cuentasBanco.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] text-gray-400 uppercase font-semibold mb-1.5">Cuentas</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {cuentasBanco.map(c => <FilaCuenta key={c.cuenta_id} c={c} labelDia={labelDia} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detalle de gastos del rango (cada gasto, no solo el total) */}
      {cuadre.gastosDetalle.length > 0 && (
        <div className="mt-6 rounded-xl border border-red-200 bg-white overflow-hidden">
          <div className="px-5 py-3 border-b border-red-100 bg-red-50/60 flex items-center justify-between">
            <p className="text-sm font-semibold text-red-800">
              Gastos {desde === hasta ? 'del día' : 'del rango'} <span className="text-xs text-red-500">({cuadre.gastosDetalle.length})</span>
            </p>
            <p className="text-xs text-red-700">Total <span className="font-bold">{formatCOP(totalGastosRango)}</span></p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase">
                <th className="text-left px-5 py-2">Categoría</th>
                <th className="text-left px-3 py-2">Detalle</th>
                {multiSede && <th className="text-left px-3 py-2">Sede</th>}
                <th className="text-right px-5 py-2">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {cuadre.gastosDetalle.map((g, i) => (
                <tr key={i}>
                  <td className="px-5 py-2 text-gray-700">{CATEGORIA_GASTO_LABELS[g.categoria as CategoriaGasto] ?? g.categoria}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{g.observacion || '—'}</td>
                  {multiSede && <td className="px-3 py-2 text-gray-500">{g.sede_codigo}</td>}
                  <td className="px-5 py-2 text-right font-medium text-red-600">{formatCOP(g.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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

              {/* Por método (cada uno se despliega para ver sus ingresos) */}
              <MetodosCuadre metodos={s.porMetodo} />
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
                <th className="text-left px-3 py-2">Pago</th>
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
                  <td className="px-3 py-2 text-gray-600 text-xs">{f.metodos}</td>
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

// Fila de una cuenta en el panel: nombre + "Hoy X" y "Total Y" (el total solo
// si el usuario puede verlo; si no, muestra "—").
function FilaCuenta({ c, labelDia, verde }: { c: SaldoCuenta; labelDia: string; verde?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${verde ? 'bg-green-50/60' : c.total < 0 && c.verTotal ? 'bg-red-50' : 'bg-gray-50'}`}>
      <p className="text-sm text-gray-800 truncate">{c.nombre}</p>
      <div className="flex items-center justify-between mt-1 text-xs">
        <span className="text-gray-500">{labelDia} <span className="font-semibold text-gray-700">{formatCOP(c.hoy)}</span></span>
        {c.verTotal
          ? <span className="text-gray-500">Total <span className={`font-bold ${verde ? 'text-green-700' : c.total < 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatCOP(c.total)}</span></span>
          : <span className="text-gray-300">Total —</span>}
      </div>
    </div>
  )
}
