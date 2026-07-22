import Link from 'next/link'
import { getCuadre, getSaldosCuentas, type SaldoCuenta } from '@/lib/queries/cuadre'
import { getSesion } from '@/lib/auth/acceso'
import { createClient } from '@/lib/supabase/server'
import { formatCOP, formatFecha, hoyBogota } from '@/lib/utils/format'
import { ESTADO_FACTURA_LABELS, ESTADO_FACTURA_COLORES, ESTADO_LABELS, ESTADO_COLORES, EstadoFactura, EstadoPedido, CATEGORIA_GASTO_LABELS, CategoriaGasto } from '@/types'
import { CuadreFiltrosBar } from '@/components/cuadre/CuadreFiltrosBar'
import { CuadreDescargable } from '@/components/cuadre/CuadreDescargable'
import { MetodosCuadre } from '@/components/cuadre/MetodosCuadre'
import { ReabrirCajaButton } from '@/components/cuadre/ReabrirCajaButton'
import { CerrarCajaButton } from '@/components/dashboard/CerrarCajaButton'

// Título numerado de sección: para que cada parte del cuadre se identifique
// de una mirada (1 Resumen · 2 Dinero por cuenta · 3 Sedes · 4 Gastos · 5 Detalle)
function TituloSeccion({ n, titulo, color, extra }: { n: number; titulo: string; color: string; extra?: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-3 mt-8 first:mt-0">
      <span className={`w-7 h-7 rounded-lg ${color} text-white text-sm font-bold flex items-center justify-center shrink-0`}>{n}</span>
      <p className="text-sm font-bold text-gray-900 uppercase tracking-wide">{titulo}</p>
      {extra && <p className="text-xs text-gray-400">{extra}</p>}
    </div>
  )
}

export default async function CuadrePage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; sede?: string }>
}) {
  const sp = await searchParams
  const desde = sp.desde || hoyBogota()
  const hasta = sp.hasta || desde
  const sede = sp.sede || ''

  const [sesion, cuadre, saldosCuentas] = await Promise.all([
    getSesion(),
    getCuadre({ desde, hasta, sede: sede || undefined }),
    getSaldosCuentas(sede || undefined, { desde, hasta }),
  ])
  const esAdmin = sesion.rol === 'admin'
  // El cuadre muestra SOLO lo del día/rango (los acumulados viven en Flujo de
  // caja): efectivo siempre, y las demás cuentas solo si les entró plata.
  const cuentasVisibles = saldosCuentas.filter(c => c.es_efectivo || c.hoy !== 0)
  const efectivoCajas  = cuentasVisibles.filter(c => c.es_efectivo)
  const cuentasBanco   = cuentasVisibles.filter(c => !c.es_efectivo)
  const efectivoHoy    = efectivoCajas.reduce((s, c) => s + c.hoy, 0)
  const cuentasHoy     = cuentasBanco.reduce((s, c) => s + c.hoy, 0)
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
            href={`/cuadre/imprimir?${params.toString()}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 text-white px-4 py-2 text-sm font-medium hover:bg-gray-700"
          >
            🖨 PDF carta
          </a>
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

      {/* ═══ 1 · RESUMEN ═══════════════════════════════════════════════ */}
      <TituloSeccion n={1} titulo={desde === hasta ? 'Resumen del día' : 'Resumen del período'} color="bg-blue-600" />
      <div className={`grid grid-cols-2 ${esAdmin ? 'md:grid-cols-5' : 'md:grid-cols-3'} gap-3`}>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs text-gray-500 uppercase font-semibold">Vendido</p>
          <p className="text-lg font-bold text-gray-900 mt-1">{formatCOP(cuadre.totalVendido)}</p>
        </div>
        <div className="bg-green-50 rounded-2xl border border-green-200 shadow-sm p-4">
          <p className="text-xs text-green-700 uppercase font-semibold">Recaudado en caja</p>
          <p className="text-lg font-bold text-green-700 mt-1">{formatCOP(cuadre.totalRecaudadoCaja)}</p>
        </div>
        <div className="bg-amber-50 rounded-2xl border border-amber-200 shadow-sm p-4">
          <p className="text-xs text-amber-700 uppercase font-semibold">Por cobrar mensajería</p>
          <p className="text-lg font-bold text-amber-700 mt-1">{formatCOP(cuadre.totalPorCobrarMensajeria)}</p>
        </div>
        {esAdmin && (
          <div className="bg-red-50 rounded-2xl border border-red-200 shadow-sm p-4">
            <p className="text-xs text-red-700 uppercase font-semibold">Gastos</p>
            <p className="text-lg font-bold text-red-700 mt-1">{formatCOP(cuadre.totalGastos)}</p>
          </div>
        )}
        {esAdmin && (
          <div className="bg-blue-600 rounded-2xl shadow-sm p-4">
            <p className="text-xs text-blue-100 uppercase font-semibold">Neto en caja</p>
            <p className="text-lg font-bold text-white mt-1">{formatCOP(cuadre.totalNetoCaja)}</p>
            <p className="text-[10px] text-blue-200">recaudado − gastos</p>
          </div>
        )}
      </div>

      {/* ═══ 2 · DINERO RECOGIDO POR CUENTA (solo el día/rango) ════════ */}
      {cuentasVisibles.length > 0 && (
        <>
          <TituloSeccion n={2} titulo={`Dinero recogido por cuenta (${labelDia.toLowerCase()})`} color="bg-emerald-600"
            extra="los acumulados están en Flujo de caja" />
          <div className="rounded-2xl border border-gray-100 shadow-sm bg-white p-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex gap-3 flex-wrap">
                <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-2.5">
                  <p className="text-[11px] text-green-700 uppercase font-semibold">💵 Efectivo {labelDia.toLowerCase()}</p>
                  <p className="text-lg font-bold text-green-800">{formatCOP(efectivoHoy)}</p>
                </div>
                <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-2.5">
                  <p className="text-[11px] text-blue-700 uppercase font-semibold">🏦 Cuentas {labelDia.toLowerCase()}</p>
                  <p className="text-lg font-bold text-blue-800">{formatCOP(cuentasHoy)}</p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[11px] text-gray-400 uppercase">{labelDia} recogido</p>
                <p className="text-2xl font-bold text-gray-900">{formatCOP(recogidoHoy)}</p>
              </div>
            </div>

            {/* Efectivo */}
            {efectivoCajas.length > 0 && (
              <div className="mt-4">
                <p className="text-[11px] text-green-700 uppercase font-semibold mb-1.5">💵 Efectivo ({efectivoCajas.length})</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                  {efectivoCajas.map((c, i) => <FilaCuenta key={c.cuenta_id} c={c} n={i + 1} labelDia={labelDia} verde />)}
                </div>
              </div>
            )}

            {/* Cuentas (Nequi, Bancolombia, Davivienda…) que recibieron plata */}
            {cuentasBanco.length > 0 && (
              <div className="mt-4">
                <p className="text-[11px] text-blue-700 uppercase font-semibold mb-1.5">🏦 Cuentas con movimiento ({cuentasBanco.length})</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                  {cuentasBanco.map((c, i) => <FilaCuenta key={c.cuenta_id} c={c} n={i + 1} labelDia={labelDia} />)}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══ 3 · VENTAS POR SEDE ═══════════════════════════════════════ */}
      <TituloSeccion n={3} titulo="Ventas por sede" color="bg-purple-600" />
      {cuadre.sedes.length === 0 ? (
        <div className="text-center py-10 text-gray-400 bg-white rounded-2xl border border-gray-100">No hay movimiento en este rango</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {cuadre.sedes.map(s => (
            <div key={s.sede_codigo} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 bg-purple-50/50 flex items-center justify-between">
                <p className="text-sm font-bold text-gray-900">
                  {s.sede_nombre} <span className="text-xs text-gray-400 font-normal">({s.sede_codigo})</span>
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

      {/* ═══ 4 · GASTOS DEL RANGO ══════════════════════════════════════ */}
      {cuadre.gastosDetalle.length > 0 && (
        <>
          <TituloSeccion n={4} titulo={`Gastos ${desde === hasta ? 'del día' : 'del rango'}`} color="bg-red-600"
            extra={`${cuadre.gastosDetalle.length} gasto${cuadre.gastosDetalle.length !== 1 ? 's' : ''} · ${formatCOP(totalGastosRango)}`} />
          <div className="rounded-2xl border border-red-100 shadow-sm bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-red-50/60 text-xs text-red-800 uppercase">
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
                <tr className="bg-red-50/60">
                  <td className="px-5 py-2 font-bold text-red-800" colSpan={multiSede ? 3 : 2}>Total</td>
                  <td className="px-5 py-2 text-right font-bold text-red-700">{formatCOP(totalGastosRango)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ 5 · DETALLE DEL MOVIMIENTO ════════════════════════════════ */}
      <TituloSeccion n={5} titulo="Detalle del movimiento" color="bg-gray-700"
        extra="toca cada lista para abrirla o cerrarla" />
      <div className="space-y-3">

        {/* Facturas emitidas (desplegable) */}
        <details className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden group">
          <summary className="px-5 py-3 cursor-pointer flex items-center justify-between hover:bg-gray-50 list-none [&::-webkit-details-marker]:hidden select-none">
            <p className="text-sm font-semibold text-gray-900">
              🧾 Facturas emitidas <span className="text-xs text-gray-400">({cuadre.facturas.length})</span>
            </p>
            <p className="text-xs text-gray-500 flex items-center gap-2">
              Total <span className="font-bold text-gray-900">{formatCOP(cuadre.totalFacturado)}</span>
              <span className="text-gray-300 group-open:rotate-180 transition-transform">▾</span>
            </p>
          </summary>
          {cuadre.facturas.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-400 text-center border-t border-gray-100">No se emitieron facturas en este rango</p>
          ) : (
            <table className="w-full text-sm border-t border-gray-100">
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
                  <tr key={f.numero_factura} className="hover:bg-gray-50/60">
                    <td className="px-5 py-2 font-mono">
                      <Link href={`/facturacion/n/${encodeURIComponent(f.numero_factura)}`} className="text-blue-600 hover:underline">
                        {f.numero_factura}
                      </Link>
                    </td>
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
        </details>

        {/* Pedidos vendidos (desplegable) */}
        <details className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden group">
          <summary className="px-5 py-3 cursor-pointer flex items-center justify-between hover:bg-gray-50 list-none [&::-webkit-details-marker]:hidden select-none">
            <p className="text-sm font-semibold text-gray-900">
              📦 Pedidos vendidos <span className="text-xs text-gray-400">({cuadre.pedidos.length})</span>
            </p>
            <p className="text-xs text-gray-500 flex items-center gap-2">
              Total <span className="font-bold text-gray-900">{formatCOP(cuadre.totalPedidos)}</span>
              <span className="text-gray-300 group-open:rotate-180 transition-transform">▾</span>
            </p>
          </summary>
          {cuadre.pedidos.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-400 text-center border-t border-gray-100">No se crearon pedidos en este rango</p>
          ) : (
            <table className="w-full text-sm border-t border-gray-100">
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
                  <tr key={p.numero_orden} className="hover:bg-gray-50/60">
                    <td className="px-5 py-2 font-mono">
                      <Link href={`/pedidos/${p.id}`} className="text-blue-600 hover:underline">{p.numero_orden}</Link>
                    </td>
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
        </details>

        {/* Recaudo por asesor (desplegable) */}
        {cuadre.porAsesor.length > 0 && (
          <details className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden group">
            <summary className="px-5 py-3 cursor-pointer flex items-center justify-between hover:bg-gray-50 list-none [&::-webkit-details-marker]:hidden select-none">
              <p className="text-sm font-semibold text-gray-900">
                👤 Recaudo en caja por asesor <span className="text-xs text-gray-400">({cuadre.porAsesor.length})</span>
              </p>
              <span className="text-gray-300 group-open:rotate-180 transition-transform text-xs">▾</span>
            </summary>
            <table className="w-full text-sm border-t border-gray-100">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase">
                  <th className="text-left px-5 py-2">Asesor</th>
                  <th className="text-right px-5 py-2">Recaudado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {cuadre.porAsesor.map(a => (
                  <tr key={a.asesor_id} className="hover:bg-gray-50/60">
                    <td className="px-5 py-2.5 text-gray-800">{a.asesor_nombre}</td>
                    <td className="px-5 py-2.5 text-right font-semibold text-gray-900">{formatCOP(a.recaudadoCaja)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </div>

      </CuadreDescargable>
      </div>
    </div>
  )
}

// Casilla de una cuenta en el panel: número + nombre destacado y lo recogido
// en el día/rango en grande. Los acumulados se consultan en Flujo de caja.
function FilaCuenta({ c, n, labelDia, verde }: { c: SaldoCuenta; n: number; labelDia: string; verde?: boolean }) {
  return (
    <div className={`rounded-xl border px-3.5 py-3 ${verde ? 'bg-green-50/50 border-green-200' : 'bg-white border-gray-200'}`}>
      <div className="flex items-center gap-2">
        <span className={`w-5 h-5 rounded-md text-white text-[11px] font-bold flex items-center justify-center shrink-0 ${verde ? 'bg-green-600' : 'bg-blue-600'}`}>{n}</span>
        <p className="text-sm font-bold text-gray-900 truncate">{c.nombre}</p>
      </div>
      <div className="flex items-end justify-between mt-2 pt-2 border-t border-gray-100">
        <span className="text-xs text-gray-400 uppercase">{labelDia}</span>
        <span className={`text-base font-bold ${verde ? 'text-green-700' : 'text-gray-900'}`}>{formatCOP(c.hoy)}</span>
      </div>
    </div>
  )
}
