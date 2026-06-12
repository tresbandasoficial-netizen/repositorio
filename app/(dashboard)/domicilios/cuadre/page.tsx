import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getDomiciliosPorFecha, getCuadreDia, getCierreDia, calcularCuadreDomicilio } from '@/lib/queries/domicilios'
import Link from 'next/link'
import { CuadreDiaCierreBotones } from '@/components/domicilios/CuadreDiaCierreBotones'

function formatCOP(v: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v)
}

const MENSAJERIA_LABELS = { exneider: 'Exneider', servigo: 'Servigo' }

export default async function CuadreDiaPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { fecha: fechaParam } = await searchParams
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
  const fecha = fechaParam ?? hoy

  const [domicilios, cuadre, cierre] = await Promise.all([
    getDomiciliosPorFecha(fecha),
    getCuadreDia(fecha),
    getCierreDia(fecha),
  ])

  const exneider = domicilios.filter(d => d.mensajeria === 'exneider')
  const servigo  = domicilios.filter(d => d.mensajeria === 'servigo')

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <Link href={`/domicilios?fecha=${fecha}`} className="text-sm text-gray-400 hover:text-gray-600 mb-1 inline-block">
            ← Volver
          </Link>
          <h1 className="text-xl font-bold text-gray-900">Cuadre diario</h1>
          <p className="text-sm text-gray-500">{fecha}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-gray-400">Neto del día</p>
            <p className={`text-2xl font-bold ${cuadre.total_neto >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
              {formatCOP(cuadre.total_neto)}
            </p>
          </div>
          {/* Botón cerrar / estado cerrado */}
          <CuadreDiaCierreBotones
            fecha={fecha}
            cierre={cierre}
            cuadre={cuadre}
          />
        </div>
      </div>

      {/* Banner día cerrado */}
      {cierre && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-xl px-5 py-3 flex items-center gap-3">
          <span className="text-green-600 text-lg">✓</span>
          <div>
            <p className="text-sm font-semibold text-green-800">Día cuadrado</p>
            <p className="text-xs text-green-600">
              Cerrado por {cierre.cerrado_por_nombre} el {new Date(cierre.cerrado_en).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          </div>
        </div>
      )}

      {domicilios.length === 0 ? (
        <div className="text-center py-20 text-gray-400">No hay domicilios registrados para este día</div>
      ) : (
        <div className="space-y-8">
          {/* Resumen por mensajería */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Resumen</h2>
            </div>
            <div className="divide-y divide-gray-50">
              {cuadre.por_mensajeria.filter(m => m.total_domicilios > 0).map(m => (
                <div key={m.mensajeria} className="px-5 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-sm font-semibold px-2.5 py-0.5 rounded-full ${
                      m.mensajeria === 'exneider' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                    }`}>
                      {MENSAJERIA_LABELS[m.mensajeria]}
                    </span>
                    <span className={`font-bold text-lg ${m.neto >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                      {m.neto >= 0 ? 'Nos deben' : 'Les debemos'} {formatCOP(Math.abs(m.neto))}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="bg-gray-50 rounded-lg p-3 text-center">
                      <p className="text-xs text-gray-400 mb-1">Domicilios</p>
                      <p className="font-semibold text-gray-900">{m.total_domicilios}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3 text-center">
                      <p className="text-xs text-gray-400 mb-1">Efectivo recogido</p>
                      <p className="font-semibold text-green-700">{formatCOP(m.nos_deben)}</p>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-3 text-center">
                      <p className="text-xs text-gray-400 mb-1">Domis pagamos</p>
                      <p className="font-semibold text-amber-700">{formatCOP(m.les_debemos)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Detalle por mensajería */}
          {[{ label: 'Exneider', lista: exneider }, { label: 'Servigo', lista: servigo }]
            .filter(g => g.lista.length > 0)
            .map(({ label, lista }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-900">Detalle {label}</h2>
                  <span className="text-xs text-gray-400">{lista.length} domicilio{lista.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">
                        <th className="text-left px-4 py-2 font-medium">#</th>
                        <th className="text-left px-4 py-2 font-medium">Cliente</th>
                        <th className="text-left px-4 py-2 font-medium">Dirección</th>
                        <th className="text-left px-4 py-2 font-medium">Artículo</th>
                        <th className="text-left px-4 py-2 font-medium">Pago</th>
                        <th className="text-right px-4 py-2 font-medium">Cobra</th>
                        <th className="text-right px-4 py-2 font-medium">Domi</th>
                        <th className="text-right px-4 py-2 font-medium">Neto</th>
                        <th className="text-left px-4 py-2 font-medium">Estado</th>
                        <th className="text-left px-4 py-2 font-medium">Asesor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {lista.map((d, i) => {
                        const c = calcularCuadreDomicilio(d)
                        return (
                          <tr key={d.id} className="hover:bg-gray-50/50">
                            <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                            <td className="px-4 py-3">
                              <p className="font-medium text-gray-900">{d.cliente_nombre}</p>
                              {d.cliente_telefono && <p className="text-xs text-gray-400">{d.cliente_telefono}</p>}
                              {d.numero_pedido && (
                                <span className="text-xs font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                                  {d.numero_pedido}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-gray-600 max-w-[180px]">
                              <p className="truncate">{d.direccion}</p>
                              {d.notas && <p className="text-xs text-gray-400 italic truncate">{d.notas}</p>}
                            </td>
                            <td className="px-4 py-3 text-gray-500">{d.articulo ?? '—'}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                d.metodo_pago === 'transferencia'
                                  ? 'bg-cyan-100 text-cyan-700'
                                  : 'bg-amber-100 text-amber-700'
                              }`}>
                                {d.metodo_pago === 'transferencia' ? 'Transf.' : 'Efectivo'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {c.nos_deben > 0
                                ? <span className="font-medium text-green-700">{formatCOP(c.nos_deben)}</span>
                                : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {d.valor_domicilio > 0 ? (
                                <span className={d.cobrar_al_cliente ? 'text-gray-400' : 'font-medium text-amber-700'}>
                                  {formatCOP(d.valor_domicilio)}
                                  <span className="text-xs ml-1">{d.cobrar_al_cliente ? '(cli)' : '(nos)'}</span>
                                </span>
                              ) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={`font-semibold ${c.neto >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                                {formatCOP(c.neto)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                d.estado === 'entregado'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-gray-100 text-gray-500'
                              }`}>
                                {d.estado === 'entregado' ? 'Entregado' : 'Pendiente'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-500 text-xs">{d.asesor_nombre}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 font-semibold text-sm border-t border-gray-200">
                        <td colSpan={5} className="px-4 py-3 text-gray-500">Total {label}</td>
                        <td className="px-4 py-3 text-right text-green-700">
                          {formatCOP(lista.reduce((s, d) => s + calcularCuadreDomicilio(d).nos_deben, 0))}
                        </td>
                        <td className="px-4 py-3 text-right text-amber-700">
                          {formatCOP(lista.reduce((s, d) => s + (d.cobrar_al_cliente ? 0 : d.valor_domicilio), 0))}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900">
                          {formatCOP(lista.reduce((s, d) => s + calcularCuadreDomicilio(d).neto, 0))}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            ))}

          {/* Por asesor */}
          {cuadre.por_asesor.length > 1 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">Por asesor</h2>
              </div>
              <div className="divide-y divide-gray-50">
                {cuadre.por_asesor.map(a => (
                  <div key={a.asesor_nombre} className="px-5 py-3 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">{a.asesor_nombre}</span>
                    <div className="text-right text-sm">
                      <span className="text-gray-400">{a.total} domicilio{a.total !== 1 ? 's' : ''}</span>
                      <span className="ml-3 font-semibold text-gray-900">{formatCOP(a.valor)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
