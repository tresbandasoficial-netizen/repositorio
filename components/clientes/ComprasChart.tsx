import { formatCOP } from '@/lib/utils/format'

export type MesCompra = {
  clave: string      // 'YYYY-MM'
  label: string      // 'jul 26'
  total: number      // COP comprado ese mes
  pedidos: number    // cantidad de pedidos
}

// Geometría del área de dibujo, en unidades del viewBox.
const W = 720, H = 216
const IZQ = 10, DER = 12, ARR = 26, ABJ = 34

function corto(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}M`
  if (v >= 1000) return `${Math.round(v / 1000)}k`
  return String(v)
}

// Compras del cliente mes a mes, como línea sobre un eje de tiempo continuo:
// los meses sin compra valen 0 y se ven, que es justo la información útil
// (cuánto tiempo pasó sin volver).
//
// Server component puro: la gráfica es un SVG sin JavaScript. El valor de cada
// mes se lee al pasar el mouse por el <title> de cada punto, que el navegador
// muestra solo.
export function ComprasChart({ meses }: { meses: MesCompra[] }) {
  if (meses.length === 0) {
    return <p className="px-6 py-8 text-sm text-gray-400 text-center">Sin compras para graficar.</p>
  }

  const activos = meses.filter(m => m.total > 0)
  const maxTotal = Math.max(...meses.map(m => m.total), 1)
  const totalGeneral = meses.reduce((s, m) => s + m.total, 0)
  // Promedio sobre los meses en que SÍ compró: dividir por la ventana completa
  // daría un número que no significa nada para un cliente de una sola compra.
  const promedioActivo = activos.length > 0 ? Math.round(totalGeneral / activos.length) : 0
  const mejorMes = activos.reduce((a, b) => (b.total > a.total ? b : a), activos[0] ?? meses[0])
  const ultimo = meses[meses.length - 1]

  const anchoUtil = W - IZQ - DER
  const altoUtil = H - ARR - ABJ
  const x = (i: number) => IZQ + (meses.length === 1 ? anchoUtil / 2 : (i / (meses.length - 1)) * anchoUtil)
  const y = (v: number) => ARR + altoUtil - (v / maxTotal) * altoUtil

  const puntos = meses.map((m, i) => `${x(i).toFixed(1)},${y(m.total).toFixed(1)}`).join(' ')
  const area = `M ${x(0).toFixed(1)},${(ARR + altoUtil).toFixed(1)} L ${puntos.split(' ').join(' L ')} L ${x(meses.length - 1).toFixed(1)},${(ARR + altoUtil).toFixed(1)} Z`

  // Con 12+ meses las etiquetas se pisan: se muestran ~7 como máximo, y siempre
  // el primero y el último.
  const paso = Math.max(1, Math.ceil(meses.length / 7))
  const mostrarLabel = (i: number) => i === 0 || i === meses.length - 1 || i % paso === 0

  const resumen = `Compras por mes desde ${meses[0].label} hasta ${ultimo.label}. `
    + `Total ${formatCOP(totalGeneral)} en ${activos.length} ${activos.length === 1 ? 'mes' : 'meses'} con compras. `
    + `Mejor mes ${mejorMes.label} con ${formatCOP(mejorMes.total)}.`

  return (
    <div className="px-5 py-4">
      {/* Resumen arriba de la gráfica */}
      <div className="flex flex-wrap gap-x-6 gap-y-3 mb-3 text-xs">
        <div>
          <span className="text-gray-400">Promedio por mes con compra</span>
          <p className="text-sm font-bold text-gray-900 tabular-nums">{formatCOP(promedioActivo)}</p>
        </div>
        <div>
          <span className="text-gray-400">Mejor mes</span>
          <p className="text-sm font-bold text-blue-700 tabular-nums">
            {formatCOP(mejorMes.total)} <span className="font-normal text-gray-400">({mejorMes.label})</span>
          </p>
        </div>
        <div>
          <span className="text-gray-400">Meses con compra</span>
          <p className="text-sm font-bold text-gray-900 tabular-nums">
            {activos.length} <span className="font-normal text-gray-400">de {meses.length}</span>
          </p>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={resumen}
        className="overflow-visible"
        style={{ height: 'auto' }}
      >
        {/* Rejilla: recesiva y sin números. Cada mes con compra ya lleva su
            valor escrito encima, así que rotular el eje solo repetía la cifra —
            y la del máximo se pisaba con el valor del primer mes cuando ese mes
            estaba cerca del techo. */}
        {[0, 0.5, 1].map(f => {
          const yy = ARR + altoUtil - f * altoUtil
          return (
            <line
              key={f}
              x1={IZQ} x2={W - DER} y1={yy} y2={yy}
              stroke="#e5e7eb" strokeWidth="1" vectorEffect="non-scaling-stroke"
            />
          )
        })}

        {/* Área bajo la línea */}
        <path d={area} fill="#2563eb" fillOpacity="0.09" />

        {/* La línea */}
        <polyline
          points={puntos}
          fill="none"
          stroke="#2563eb"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* Puntos: marcados solo los meses con compra, para no ensuciar los ceros */}
        {meses.map((m, i) => {
          if (m.total === 0) return null
          const esMejor = m.clave === mejorMes.clave
          return (
            <g key={m.clave}>
              <circle
                cx={x(i)} cy={y(m.total)} r={esMejor ? 5.5 : 4.5}
                fill={esMejor ? '#1d4ed8' : '#ffffff'}
                stroke="#2563eb" strokeWidth="2" vectorEffect="non-scaling-stroke"
              >
                <title>{`${m.label}: ${formatCOP(m.total)} · ${m.pedidos} pedido${m.pedidos !== 1 ? 's' : ''}`}</title>
              </circle>
              {/* Etiqueta directa solo en los meses con compra: nunca un número
                  sobre cada punto, y aquí los ceros son la mayoría. */}
              <text
                x={x(i)} y={y(m.total) - 11}
                fontSize="11" fontWeight="600" fill="#374151" textAnchor="middle"
              >
                {corto(m.total)}
              </text>
            </g>
          )
        })}

        {/* Meses en el eje */}
        {meses.map((m, i) =>
          mostrarLabel(i) ? (
            <text
              key={m.clave}
              x={x(i)} y={H - 14}
              fontSize="11" fill="#9ca3af"
              textAnchor={i === 0 ? 'start' : i === meses.length - 1 ? 'end' : 'middle'}
            >
              {m.label}
            </text>
          ) : null
        )}
      </svg>

      {activos.length === 1 && (
        <p className="mt-1 text-xs text-gray-400">
          Una sola compra en {mejorMes.label}. Los meses en cero son meses sin volver.
        </p>
      )}
    </div>
  )
}
