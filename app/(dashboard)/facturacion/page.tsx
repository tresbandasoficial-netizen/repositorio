import Link from 'next/link'
import { getFacturas } from '@/lib/queries/facturas'
import { getResumenCxC } from '@/lib/queries/facturas'
import { formatCOP, formatFecha } from '@/lib/utils/format'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ESTADO_FACTURA_LABELS, ESTADO_FACTURA_COLORES, EstadoFactura } from '@/types'

export default async function FacturacionPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; q?: string }>
}) {
  const sp = await searchParams
  const estado = sp.estado as EstadoFactura | undefined

  const [facturas, resumen] = await Promise.all([
    getFacturas({ estado, q: sp.q }),
    getResumenCxC(),
  ])

  const filtros: { key: EstadoFactura | 'todas'; label: string }[] = [
    { key: 'todas', label: 'Todas' },
    { key: 'pendiente', label: 'Pendientes' },
    { key: 'vencida', label: 'Vencidas' },
    { key: 'pagada', label: 'Pagadas' },
    { key: 'anulada', label: 'Anuladas' },
  ]

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Facturación</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {facturas.length === 0 ? 'Sin facturas' : `${facturas.length} factura${facturas.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <Link href="/facturacion/nueva">
          <Button>+ Nueva factura</Button>
        </Link>
      </div>

      {/* Resumen rápido */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Por cobrar</p>
          <p className="text-lg font-bold text-gray-900 mt-1">{formatCOP(resumen.totalPorCobrar)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-red-500 uppercase tracking-wide">Vencido</p>
          <p className="text-lg font-bold text-red-600 mt-1">{formatCOP(resumen.totalVencido)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 col-span-2 md:col-span-1">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Facturas activas</p>
          <p className="text-lg font-bold text-gray-900 mt-1">
            {resumen.facturasPendientes + resumen.facturasVencidas}
            <span className="text-xs font-normal text-gray-400 ml-2">{resumen.facturasVencidas} vencidas</span>
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-4">
        {filtros.map(f => {
          const active = (f.key === 'todas' && !estado) || estado === f.key
          const href = f.key === 'todas' ? '/facturacion' : `/facturacion?estado=${f.key}`
          return (
            <Link
              key={f.key}
              href={href}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                active ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f.label}
            </Link>
          )
        })}
      </div>

      {facturas.length === 0 ? (
        <div className="text-center py-16 text-gray-400">No hay facturas con este filtro</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Factura</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Cliente</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Sede</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Vence</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Saldo</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {facturas.map(f => (
                <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-mono text-xs text-gray-700">{f.numero_factura}</td>
                  <td className="px-4 py-4">
                    <p className="font-medium text-gray-900">{f.cliente_nombre}</p>
                    <p className="text-xs text-gray-400">{f.cliente_telefono}</p>
                  </td>
                  <td className="px-4 py-4 text-center hidden sm:table-cell">
                    <span className="text-xs font-semibold text-gray-600">{f.sede_codigo}</span>
                  </td>
                  <td className="px-4 py-4 hidden md:table-cell text-gray-600">
                    {formatFecha(f.fecha_vencimiento)}
                    {f.dias_atraso > 0 && (
                      <span className="block text-xs text-red-500">{f.dias_atraso} días atraso</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span className={`font-semibold ${f.saldo > 0 ? 'text-gray-900' : 'text-green-600'}`}>
                      {formatCOP(f.saldo)}
                    </span>
                    {f.total_abonado > 0 && f.saldo > 0 && (
                      <span className="block text-xs text-gray-400">de {formatCOP(f.total)}</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <Badge className={ESTADO_FACTURA_COLORES[f.estado]}>{ESTADO_FACTURA_LABELS[f.estado]}</Badge>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <Link href={`/facturacion/${f.id}`} className="text-sm text-blue-600 hover:underline font-medium">
                      Ver →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
