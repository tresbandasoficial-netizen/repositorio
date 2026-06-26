import Link from 'next/link'
import { getMorosos, getResumenCxC } from '@/lib/queries/facturas'
import { formatCOP, formatFecha } from '@/lib/utils/format'

export default async function CuentasPorCobrarPage() {
  const [morosos, resumen] = await Promise.all([getMorosos(), getResumenCxC()])

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Cuentas por cobrar</h1>
        <p className="text-sm text-gray-500 mt-0.5">Facturas vencidas con saldo pendiente</p>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total por cobrar</p>
          <p className="text-lg font-bold text-gray-900 mt-1">{formatCOP(resumen.totalPorCobrar)}</p>
        </div>
        <div className="bg-white rounded-xl border border-red-100 p-4">
          <p className="text-xs text-red-500 uppercase tracking-wide">Total vencido</p>
          <p className="text-lg font-bold text-red-600 mt-1">{formatCOP(resumen.totalVencido)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Facturas vencidas</p>
          <p className="text-lg font-bold text-gray-900 mt-1">{resumen.facturasVencidas}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Pendientes (al día)</p>
          <p className="text-lg font-bold text-gray-900 mt-1">{resumen.facturasPendientes}</p>
        </div>
      </div>

      {morosos.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          🎉 No hay clientes morosos. Todas las facturas están al día.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Cliente</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Factura</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Atraso</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Saldo</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {morosos.map(f => (
                <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-900">{f.cliente_nombre}</p>
                    <p className="text-xs text-gray-400">{f.cliente_telefono} · {f.sede_codigo}</p>
                  </td>
                  <td className="px-4 py-4 hidden sm:table-cell">
                    <p className="font-mono text-xs text-gray-600">{f.numero_factura}</p>
                    <p className="text-xs text-gray-400">venció {formatFecha(f.fecha_vencimiento)}</p>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className="inline-flex items-center rounded-full bg-red-100 text-red-700 px-2.5 py-0.5 text-xs font-bold">
                      {f.dias_atraso} días
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right font-bold text-red-600">{formatCOP(f.saldo)}</td>
                  <td className="px-4 py-4 text-right">
                    <Link
                      href={`/facturacion/${f.id}`}
                      className="inline-block px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Cobrar
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
