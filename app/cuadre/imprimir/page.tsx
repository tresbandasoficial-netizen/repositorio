import { getCuadre, getSaldosCuentas } from '@/lib/queries/cuadre'
import { getSesion } from '@/lib/auth/acceso'
import { createClient } from '@/lib/supabase/server'
import { formatCOP, formatFecha, formatFechaHora, hoyBogota } from '@/lib/utils/format'
import { ESTADO_FACTURA_LABELS, ESTADO_LABELS, EstadoFactura, EstadoPedido, CATEGORIA_GASTO_LABELS, CategoriaGasto } from '@/types'
import { PrintButton } from '@/components/pedidos/PrintButton'

// Versión imprimible del cuadre de caja: tamaño carta, puede ocupar varias hojas.
export default async function CuadreImprimirPage({
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

  const supabase = await createClient()
  const { data: sedes } = await supabase.from('sedes').select('codigo, nombre').order('codigo')

  const multiSede = !sede
  const rangoLabel = desde === hasta ? formatFecha(desde) : `${formatFecha(desde)} – ${formatFecha(hasta)}`
  const sedeLabel = sede ? (sedes?.find(s => s.codigo === sede)?.nombre ?? sede) : 'Todas las sedes'
  const labelDia = desde === hasta ? 'Día' : 'Período'

  const cuentasVisibles = saldosCuentas.filter(c => c.es_efectivo || c.hoy !== 0 || (c.verTotal && c.total !== 0))
  const totalGastosRango = cuadre.gastosDetalle.reduce((s, g) => s + g.valor, 0)

  const celda = 'px-2 py-1 border border-gray-300'
  const encabezado = 'px-2 py-1 border border-gray-400 bg-gray-100 text-left font-semibold'

  return (
    <>
      <div className="no-print fixed top-4 right-4 z-10 flex gap-2">
        <PrintButton />
        <a
          href={`/cuadre?desde=${desde}&hasta=${hasta}${sede ? `&sede=${sede}` : ''}`}
          className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          Volver
        </a>
      </div>

      <div className="max-w-[19cm] mx-auto p-6 text-[11px] leading-snug text-gray-900 font-sans">
        {/* Encabezado */}
        <div className="flex items-start justify-between border-b-2 border-gray-900 pb-3 mb-4">
          <div>
            <h1 className="text-lg font-bold">Tres Bandas — Cuadre de caja</h1>
            <p className="text-gray-600">{sedeLabel} · {rangoLabel}</p>
          </div>
          <p className="text-gray-500 text-right">Generado: {formatFechaHora(new Date().toISOString())}</p>
        </div>

        {/* Totales generales */}
        <table className="w-full mb-5 border-collapse">
          <tbody>
            <tr>
              <td className={celda}><span className="text-gray-500">Vendido</span><br /><b>{formatCOP(cuadre.totalVendido)}</b></td>
              <td className={celda}><span className="text-gray-500">Recaudado en caja</span><br /><b>{formatCOP(cuadre.totalRecaudadoCaja)}</b></td>
              <td className={celda}><span className="text-gray-500">Por cobrar mensajería</span><br /><b>{formatCOP(cuadre.totalPorCobrarMensajeria)}</b></td>
              {esAdmin && <td className={celda}><span className="text-gray-500">Gastos</span><br /><b>{formatCOP(cuadre.totalGastos)}</b></td>}
              {esAdmin && <td className={celda}><span className="text-gray-500">Neto en caja</span><br /><b>{formatCOP(cuadre.totalNetoCaja)}</b></td>}
            </tr>
          </tbody>
        </table>

        {/* Dinero por cuenta */}
        {cuentasVisibles.length > 0 && (
          <section className="mb-5 seccion">
            <h2 className="font-bold text-[13px] mb-1.5">Dinero por cuenta</h2>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={encabezado}>Cuenta</th>
                  <th className={`${encabezado} text-right`}>{labelDia} (recogido)</th>
                  <th className={`${encabezado} text-right`}>Total acumulado</th>
                </tr>
              </thead>
              <tbody>
                {cuentasVisibles.map(c => (
                  <tr key={c.cuenta_id}>
                    <td className={celda}>{c.nombre}{c.es_efectivo ? ' (efectivo)' : ''}</td>
                    <td className={`${celda} text-right`}>{formatCOP(c.hoy)}</td>
                    <td className={`${celda} text-right`}>{c.verTotal ? formatCOP(c.total) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Por sede con desglose por método */}
        {cuadre.sedes.map(s => (
          <section key={s.sede_codigo} className="mb-5 seccion">
            <h2 className="font-bold text-[13px] mb-1.5">{s.sede_nombre} ({s.sede_codigo})</h2>
            <table className="w-full border-collapse mb-2">
              <tbody>
                <tr>
                  <td className={celda}><span className="text-gray-500">Vendido</span><br /><b>{formatCOP(s.vendido)}</b></td>
                  <td className={celda}><span className="text-gray-500">Recaudado en caja</span><br /><b>{formatCOP(s.recaudadoCaja)}</b></td>
                  <td className={celda}><span className="text-gray-500">Por cobrar mensajería</span><br /><b>{formatCOP(s.porCobrarMensajeria)}</b></td>
                  <td className={celda}><span className="text-gray-500">A crédito</span><br /><b>{formatCOP(s.credito)}</b></td>
                  {esAdmin && <td className={celda}><span className="text-gray-500">Gastos</span><br /><b>{formatCOP(s.gastos)}</b></td>}
                  {esAdmin && <td className={celda}><span className="text-gray-500">Neto en caja</span><br /><b>{formatCOP(s.netoCaja)}</b></td>}
                </tr>
              </tbody>
            </table>
            {s.porMetodo.length > 0 && (
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={encabezado}>Método de pago</th>
                    <th className={`${encabezado} text-right`}>Monto</th>
                    <th className={encabezado}>Ingresos que lo componen</th>
                  </tr>
                </thead>
                <tbody>
                  {s.porMetodo.filter(m => m.monto !== 0 || m.detalle.length > 0).map(m => (
                    <tr key={m.metodo}>
                      <td className={celda}>{m.label}</td>
                      <td className={`${celda} text-right font-semibold`}>{formatCOP(m.monto)}</td>
                      <td className={`${celda} text-gray-600`}>
                        {m.detalle.map(d => `${d.referencia} ${formatCOP(d.monto)}${d.confirmado ? ' ✓' : ''}`).join(' · ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ))}

        {/* Por asesor */}
        {cuadre.porAsesor.length > 0 && (
          <section className="mb-5 seccion">
            <h2 className="font-bold text-[13px] mb-1.5">Recaudo en caja por asesor</h2>
            <table className="w-full border-collapse">
              <thead>
                <tr><th className={encabezado}>Asesor</th><th className={`${encabezado} text-right`}>Recaudado</th></tr>
              </thead>
              <tbody>
                {cuadre.porAsesor.map(a => (
                  <tr key={a.asesor_id}>
                    <td className={celda}>{a.asesor_nombre}</td>
                    <td className={`${celda} text-right`}>{formatCOP(a.recaudadoCaja)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Gastos del rango */}
        {cuadre.gastosDetalle.length > 0 && (
          <section className="mb-5 seccion">
            <h2 className="font-bold text-[13px] mb-1.5">Gastos ({cuadre.gastosDetalle.length}) — Total {formatCOP(totalGastosRango)}</h2>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={encabezado}>Fecha</th>
                  <th className={encabezado}>Categoría</th>
                  <th className={encabezado}>Detalle</th>
                  {multiSede && <th className={encabezado}>Sede</th>}
                  <th className={`${encabezado} text-right`}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {cuadre.gastosDetalle.map((g, i) => (
                  <tr key={i}>
                    <td className={celda}>{formatFecha(g.fecha)}</td>
                    <td className={celda}>{CATEGORIA_GASTO_LABELS[g.categoria as CategoriaGasto] ?? g.categoria}</td>
                    <td className={celda}>{g.observacion || '—'}</td>
                    {multiSede && <td className={celda}>{g.sede_codigo}</td>}
                    <td className={`${celda} text-right`}>{formatCOP(g.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Facturas emitidas */}
        <section className="mb-5 seccion">
          <h2 className="font-bold text-[13px] mb-1.5">Facturas emitidas ({cuadre.facturas.length}) — Total {formatCOP(cuadre.totalFacturado)}</h2>
          {cuadre.facturas.length === 0 ? (
            <p className="text-gray-500">No se emitieron facturas en este rango.</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={encabezado}>N° factura</th>
                  <th className={encabezado}>Cliente</th>
                  {multiSede && <th className={encabezado}>Sede</th>}
                  <th className={encabezado}>Pago</th>
                  <th className={`${encabezado} text-right`}>Total</th>
                  <th className={`${encabezado} text-right`}>Saldo</th>
                  <th className={encabezado}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {cuadre.facturas.map(f => (
                  <tr key={f.numero_factura}>
                    <td className={`${celda} font-mono`}>{f.numero_factura}</td>
                    <td className={celda}>{f.cliente_nombre}</td>
                    {multiSede && <td className={celda}>{f.sede_codigo}</td>}
                    <td className={celda}>{f.metodos}</td>
                    <td className={`${celda} text-right`}>{formatCOP(f.total)}</td>
                    <td className={`${celda} text-right`}>{formatCOP(f.saldo)}</td>
                    <td className={celda}>{ESTADO_FACTURA_LABELS[f.estado as EstadoFactura] ?? f.estado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Pedidos vendidos */}
        <section className="mb-5 seccion">
          <h2 className="font-bold text-[13px] mb-1.5">Pedidos vendidos ({cuadre.pedidos.length}) — Total {formatCOP(cuadre.totalPedidos)}</h2>
          {cuadre.pedidos.length === 0 ? (
            <p className="text-gray-500">No se crearon pedidos en este rango.</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={encabezado}>N° pedido</th>
                  <th className={encabezado}>Cliente</th>
                  {multiSede && <th className={encabezado}>Sede</th>}
                  <th className={`${encabezado} text-right`}>Total</th>
                  <th className={`${encabezado} text-right`}>Abonado</th>
                  <th className={encabezado}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {cuadre.pedidos.map(p => (
                  <tr key={p.numero_orden}>
                    <td className={`${celda} font-mono`}>{p.numero_orden}</td>
                    <td className={celda}>{p.cliente_nombre}</td>
                    {multiSede && <td className={celda}>{p.sede_codigo}</td>}
                    <td className={`${celda} text-right`}>{formatCOP(p.total)}</td>
                    <td className={`${celda} text-right`}>{formatCOP(p.abonado)}</td>
                    <td className={celda}>{ESTADO_LABELS[p.estado as EstadoPedido] ?? p.estado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <p className="text-gray-400 border-t border-gray-300 pt-2">
          Cuadre de caja · {sedeLabel} · {rangoLabel} · Tres Bandas
        </p>
      </div>

      <style>{`
        @page { size: letter; margin: 14mm; }
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
          .seccion { break-inside: avoid; }
          table { break-inside: auto; }
          tr { break-inside: avoid; }
          thead { display: table-header-group; }
        }
      `}</style>
    </>
  )
}
