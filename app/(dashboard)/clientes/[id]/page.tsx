import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getClienteDetalle } from '@/lib/queries/clientes'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { EstadoBadge } from '@/components/pedidos/EstadoBadge'
import { formatCOP, formatFecha } from '@/lib/utils/format'
import { formatearTelefono, whatsappUrl } from '@/lib/utils/phone'
import { EstadoPedido } from '@/types'

export default async function ClienteDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

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

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/clientes" className="text-gray-400 hover:text-gray-600 text-sm">
          ← Clientes
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-lg font-bold text-gray-900 flex-1">{cliente.nombre}</h1>
        <Link
          href={`/clientes/${id}/editar`}
          className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Editar
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Columna principal — pedidos */}
        <div className="md:col-span-2 space-y-4">
          {/* Resumen financiero */}
          <div className="grid grid-cols-3 gap-3">
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
                <p className={`text-lg font-bold ${saldoTotal > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatCOP(saldoTotal)}
                </p>
                <p className="text-xs text-gray-500 mt-1">Saldo pendiente</p>
              </CardContent>
            </Card>
          </div>

          {/* Historial de pedidos */}
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-gray-900">Historial de pedidos</h2>
            </CardHeader>
            <CardContent className="p-0">
              {cliente.pedidos.length === 0 ? (
                <p className="px-6 py-4 text-sm text-gray-400">Sin pedidos registrados.</p>
              ) : (
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
                    {cliente.pedidos.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-6 py-3 font-mono font-medium text-gray-900">{p.numero_orden}</td>
                        <td className="px-4 py-3">
                          <EstadoBadge estado={p.estado as EstadoPedido} />
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{p.sede_nombre}</td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">
                          {formatCOP(p.total)}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{formatFecha(p.fecha_creacion)}</td>
                        <td className="px-4 py-3 text-right">
                          <Link href={`/pedidos/${p.id}`} className="text-xs text-blue-600 hover:underline">
                            Ver →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Columna lateral — info del cliente */}
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
        </div>
      </div>
    </div>
  )
}
