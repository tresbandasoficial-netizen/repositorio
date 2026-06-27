import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSesion } from '@/lib/auth/acceso'
import { createClient } from '@/lib/supabase/server'
import { getGananciasNegocio } from '@/lib/queries/ganancias'
import { formatCOP } from '@/lib/utils/format'
import { GananciasFiltrosBar } from '@/components/ganancias/GananciasFiltrosBar'

function hoy() { return new Date().toISOString().slice(0, 10) }
function inicioMes() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export default async function GananciasPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; sede?: string }>
}) {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') redirect('/dashboard')

  const sp = await searchParams
  const desde = sp.desde || inicioMes()
  const hasta = sp.hasta || hoy()
  const sede  = sp.sede || ''

  const supabase = await createClient()
  const [resumen, sedesRes] = await Promise.all([
    getGananciasNegocio({ desde, hasta, sede_id: sede || undefined }),
    supabase.from('sedes').select('id, codigo, nombre').order('codigo'),
  ])
  const sedes = (sedesRes.data ?? []) as { id: string; codigo: string; nombre: string }[]

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Ganancias</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Utilidad de lo vendido (entregado) menos gastos operativos.
        </p>
      </div>

      <GananciasFiltrosBar desde={desde} hasta={hasta} sede={sede} sedes={sedes} />

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <ResumenCard label="Venta" value={resumen.venta_total} />
        <ResumenCard label="Costo" value={resumen.costo_total} />
        <ResumenCard label="Utilidad bruta" value={resumen.utilidad_bruta} acento />
        <ResumenCard label="Gastos operativos" value={-resumen.gastos_operativos} />
        <ResumenCard label="Utilidad neta" value={resumen.utilidad_neta} acento fuerte />
      </div>

      {resumen.pedidos_sin_costo > 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          ⚠️ {resumen.pedidos_sin_costo} venta(s) por {formatCOP(resumen.venta_sin_costo)} sin costo
          conocido — no se incluyen en la utilidad (no se sabe en cuánto se compraron). Asigna la
          compra o sube el producto al inventario con su costo para que cuenten.
        </p>
      )}

      {/* Margen por producto (ranking) */}
      {resumen.articulos.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Margen por producto</h2>
            <p className="text-xs text-gray-500">Ordenado por mayor margen. Agrupa las ventas con costo conocido por código.</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase">
                <th className="text-left px-4 py-2.5">Código</th>
                <th className="text-right px-4 py-2.5">Ventas</th>
                <th className="text-right px-4 py-2.5">Venta</th>
                <th className="text-right px-4 py-2.5">Costo</th>
                <th className="text-right px-4 py-2.5">Utilidad</th>
                <th className="text-right px-4 py-2.5">Margen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {resumen.articulos.map(a => {
                const ok = a.utilidad >= 0
                return (
                  <tr key={a.codigo} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs text-gray-700">{a.codigo}</td>
                    <td className="px-4 py-2 text-right text-gray-500">{a.ventas}</td>
                    <td className="px-4 py-2 text-right text-gray-900">{formatCOP(a.venta)}</td>
                    <td className="px-4 py-2 text-right text-gray-900">{formatCOP(a.costo)}</td>
                    <td className={`px-4 py-2 text-right font-medium ${ok ? 'text-green-600' : 'text-red-600'}`}>{formatCOP(a.utilidad)}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${ok ? 'text-green-600' : 'text-red-600'}`}>{a.margen}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Tabla por pedido */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <p className="px-4 pt-3 text-sm font-semibold text-gray-900">Detalle por pedido</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase">
              <th className="text-left px-4 py-2.5">N° Pedido</th>
              <th className="text-left px-4 py-2.5">Código</th>
              <th className="text-right px-4 py-2.5">Precio venta</th>
              <th className="text-right px-4 py-2.5">Costo</th>
              <th className="text-right px-4 py-2.5">Utilidad</th>
              <th className="text-right px-4 py-2.5">Margen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {resumen.pedidos.map(p => {
              const margen = p.venta > 0 ? Math.round((p.utilidad / p.venta) * 100) : null
              const ok = p.utilidad >= 0
              return (
                <tr key={p.pedido_id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <Link href={`/pedidos/${p.pedido_id}`} className="font-mono text-blue-600 hover:underline">
                      {p.numero_orden}
                    </Link>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-600">{p.codigo || '—'}</td>
                  <td className="px-4 py-2 text-right text-gray-900">{formatCOP(p.venta)}</td>
                  <td className="px-4 py-2 text-right">
                    {p.tiene_costo
                      ? <span className="text-gray-900">{formatCOP(p.costo)}</span>
                      : <span className="text-xs text-amber-600">pendiente</span>}
                  </td>
                  <td className={`px-4 py-2 text-right font-medium ${ok ? 'text-green-600' : 'text-red-600'}`}>
                    {p.tiene_costo ? formatCOP(p.utilidad) : '—'}
                  </td>
                  <td className={`px-4 py-2 text-right text-xs font-medium ${ok ? 'text-green-600' : 'text-red-600'}`}>
                    {p.tiene_costo && margen !== null ? `${margen}%` : '—'}
                  </td>
                </tr>
              )
            })}
            {resumen.pedidos.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Sin ventas en el rango</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ResumenCard({ label, value, acento, fuerte }: { label: string; value: number; acento?: boolean; fuerte?: boolean }) {
  const color = acento ? (value >= 0 ? 'text-green-600' : 'text-red-600') : 'text-gray-900'
  return (
    <div className={`bg-white rounded-xl border p-4 ${fuerte ? 'border-blue-200 bg-blue-50/40' : 'border-gray-100'}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 font-bold ${fuerte ? 'text-lg' : 'text-base'} ${color}`}>{formatCOP(value)}</p>
    </div>
  )
}
