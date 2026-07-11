import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getClienteDetalle } from '@/lib/queries/clientes'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { EstadoBadge } from '@/components/pedidos/EstadoBadge'
import { formatCOP, formatFecha } from '@/lib/utils/format'
import { formatearTelefono, whatsappUrl } from '@/lib/utils/phone'
import { EstadoPedido, METODO_PAGO_LABELS, MetodoPago } from '@/types'
import { AbonarClienteButton } from '@/components/clientes/AbonarClienteButton'
import { HistorialPagos } from '@/components/clientes/HistorialPagos'
import { ComprasChart, MesCompra } from '@/components/clientes/ComprasChart'

// Agrupa los pedidos por mes (hora Bogotá) para el flujo de compras.
function comprasPorMes(pedidos: { fecha_creacion: string; total: number; estado: string }[]): MesCompra[] {
  const fmtClave = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit' })
  const fmtLabel = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', month: 'short', year: '2-digit' })
  const mapa = new Map<string, MesCompra>()
  for (const p of pedidos) {
    if (p.estado === 'cancelado') continue
    const d = new Date(p.fecha_creacion)
    const clave = fmtClave.format(d).slice(0, 7)           // 'YYYY-MM'
    const label = fmtLabel.format(d).replace('.', '')       // 'jul 26'
    const actual = mapa.get(clave) ?? { clave, label, total: 0, pedidos: 0 }
    actual.total += p.total
    actual.pedidos += 1
    mapa.set(clave, actual)
  }
  return [...mapa.values()].sort((a, b) => a.clave.localeCompare(b.clave))
}

export default async function ClienteDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('rol, sedes(codigo)')
    .eq('id', user.id)
    .single()
  const sedeCodigo = (usuario?.sedes as { codigo?: string } | null)?.codigo
  const esAdmin = usuario?.rol === 'admin'

  const { id } = await params
  const cliente = await getClienteDetalle(id)
  if (!cliente) notFound()

  const totalComprado = cliente.pedidos
    .filter((p) => p.estado !== 'cancelado')
    .reduce((sum, p) => sum + p.total, 0)

  const totalPagado = cliente.pedidos
    .filter((p) => p.estado !== 'cancelado')
    .reduce((sum, p) => sum + p.total_pagado, 0)

  const saldoTotal = totalComprado - totalPagado
  const meses = comprasPorMes(cliente.pedidos)
  const ticketPromedio = cliente.pedidos.length > 0 ? Math.round(totalComprado / cliente.pedidos.length) : 0

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <Link
          href="/clientes"
          className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          ← Clientes
        </Link>
        <h1 className="text-xl font-bold text-gray-900 flex-1">{cliente.nombre}</h1>
        <div className="flex items-center gap-2">
          <AbonarClienteButton clienteId={id} deudaTotal={saldoTotal} sedeCodigo={sedeCodigo} />
          <Link
            href={`/clientes/${id}/editar`}
            className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Editar
          </Link>
        </div>
      </div>

      {/* Resumen financiero — fila completa */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{cliente.pedidos.length}</p>
            <p className="text-xs text-gray-500 mt-1">Pedidos totales</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-lg font-bold text-gray-900">{formatCOP(totalComprado)}</p>
            <p className="text-xs text-gray-500 mt-1">Total comprado</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-lg font-bold text-gray-700">{formatCOP(ticketPromedio)}</p>
            <p className="text-xs text-gray-500 mt-1">Ticket promedio</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className={`text-lg font-bold ${saldoTotal > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatCOP(saldoTotal)}
            </p>
            <p className="text-xs text-gray-500 mt-1">Saldo pendiente</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Columna principal — gráfica + pedidos */}
        <div className="lg:col-span-2 space-y-4">
          {/* Flujo de compras (gráfica de barras por mes) */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Flujo de compras por mes</h2>
                <span className="text-xs text-gray-400">cada barra = un mes</span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ComprasChart meses={meses} />
            </CardContent>
          </Card>

          {/* Historial de pedidos */}
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-gray-900">Historial de pedidos</h2>
            </CardHeader>
            <CardContent className="p-0">
              {cliente.pedidos.length === 0 ? (
                <p className="px-6 py-4 text-sm text-gray-400">Sin pedidos registrados.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Orden</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Sede</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Total</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Fecha</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {cliente.pedidos.map((p) => {
                        // Las ventas locales (VL-) abren su factura; el resto, el pedido.
                        const href = p.numero_orden.startsWith('VL-') && p.factura_id
                          ? `/facturacion/${p.factura_id}`
                          : `/pedidos/${p.id}`
                        return (
                          <tr key={p.id} className="hover:bg-gray-50">
                            <td className="px-6 py-3">
                              <Link href={href} className="font-mono font-medium text-blue-600 hover:underline">
                                {p.numero_orden}
                              </Link>
                            </td>
                            <td className="px-4 py-3">
                              <EstadoBadge estado={p.estado as EstadoPedido} />
                            </td>
                            <td className="px-4 py-3 text-gray-600 text-xs">{p.sede_nombre}</td>
                            <td className="px-4 py-3 text-right font-medium text-gray-900">
                              {formatCOP(p.total)}
                            </td>
                            <td className="px-4 py-3 text-gray-500">{formatFecha(p.fecha_creacion)}</td>
                            <td className="px-4 py-3 text-right">
                              <Link
                                href={href}
                                className="inline-block px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50 transition-colors"
                              >
                                Ver
                              </Link>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Columna lateral — info + pagos */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-gray-900">Información</h2>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-gray-500">Nombre</p>
                <p className="font-medium text-gray-900">{cliente.nombre}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Teléfono</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="font-medium text-gray-900">{formatearTelefono(cliente.telefono_normalizado)}</p>
                  <a
                    href={whatsappUrl(cliente.telefono_normalizado)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 hover:bg-green-200 transition-colors font-medium"
                  >
                    WhatsApp
                  </a>
                </div>
              </div>
              {cliente.cedula && (
                <div>
                  <p className="text-xs text-gray-500">Cédula</p>
                  <p className="font-medium text-gray-900">{cliente.cedula}</p>
                </div>
              )}
              {cliente.email && (
                <div>
                  <p className="text-xs text-gray-500">Email</p>
                  <p className="font-medium text-gray-900 break-all">{cliente.email}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-gray-500">Cliente desde</p>
                <p className="text-gray-700">{formatFecha(cliente.creado_en)}</p>
              </div>
              {cliente.notas && (
                <div>
                  <p className="text-xs text-gray-500">Notas</p>
                  <p className="text-gray-600 whitespace-pre-wrap">{cliente.notas}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Historial de pagos */}
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-gray-900">Historial de pagos</h2>
            </CardHeader>
            <CardContent className="p-0">
              <HistorialPagos abonos={cliente.abonos} esAdmin={esAdmin} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
