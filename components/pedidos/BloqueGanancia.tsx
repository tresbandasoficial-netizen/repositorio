import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { formatCOP } from '@/lib/utils/format'
import type { GananciaPedidoDetalle } from '@/lib/queries/ganancias'

// Bloque de ganancia del pedido (solo admin): venta vs. costo, utilidad y margen.
// El costo viene de las compras asignadas al pedido; si no hay, "costo pendiente".
export function BloqueGanancia({ g }: { g: GananciaPedidoDetalle }) {
  const margen = g.venta > 0 ? Math.round((g.utilidad / g.venta) * 100) : null
  const positiva = g.utilidad >= 0

  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-gray-900">Ganancia</h2>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Venta</span>
          <span className="font-medium text-gray-900">{formatCOP(g.venta)}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-500">Costo</span>
          {g.tiene_costo
            ? <span className="font-medium text-gray-900">{formatCOP(g.costo)}</span>
            : <span className="text-xs font-medium text-amber-600">Costo pendiente</span>}
        </div>

        {/* Desglose de compras que dan el costo */}
        {g.compras.length > 0 && (
          <ul className="space-y-1 border-l-2 border-gray-100 pl-3 ml-1">
            {g.compras.map((c, i) => (
              <li key={i} className="flex justify-between text-xs text-gray-500">
                <span className="truncate mr-2">
                  {c.codigo && <span className="font-mono text-gray-400">{c.codigo} · </span>}
                  {c.descripcion}{c.cantidad > 1 ? ` ×${c.cantidad}` : ''}
                </span>
                <span className="shrink-0">{formatCOP(c.costo_unitario_cop * c.cantidad)}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-gray-100 pt-2 flex justify-between items-center">
          <span className="font-semibold text-gray-700">Utilidad</span>
          <span className="text-right">
            <span className={`font-bold ${positiva ? 'text-green-600' : 'text-red-600'}`}>
              {formatCOP(g.utilidad)}
            </span>
            {g.tiene_costo && margen !== null && (
              <span className={`ml-2 text-xs font-medium ${positiva ? 'text-green-600' : 'text-red-600'}`}>
                {margen}%
              </span>
            )}
          </span>
        </div>

        {!g.tiene_costo && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
            Falta asignar la compra de este pedido para calcular la ganancia real.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
