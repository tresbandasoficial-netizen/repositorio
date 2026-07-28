import { formatCOP, formatFecha } from '@/lib/utils/format'

// Contador ESTIMADO de puntos adiClub por correo, calculado desde las compras
// registradas. Los números oficiales viven en la app de Adidas — las tasas y
// umbrales los cambia Adidas cuando quiere; esto sirve para saber por dónde va
// cada correo sin entrar cuenta por cuenta.
//
// Tasas usadas (investigadas por el usuario, jul 2026):
//   USA:      10 puntos por USD.
//   Colombia: 10 puntos por cada $5.000 COP (1 por $500).
// Nivel: puntos acumulados en los últimos 12 meses.
//   USA:      N1 0+ · N2 1.000+ · N3 4.000+ · N4 12.000+
//   Colombia: N1 0+ · N2 1.000+ · N3 3.000+ · N4 9.000+

export type CompraPuntos = {
  correo: string | null
  tipo: 'usa' | 'colombia'
  fecha: string
  total_cop: number
  total_usd: number | null
  trm: number | null
}

const NIVELES_US = [0, 1000, 4000, 12000]
const NIVELES_CO = [0, 1000, 3000, 9000]

function puntosDe(c: CompraPuntos): number | null {
  if (c.tipo === 'usa') {
    // Sin USD ni TRM no hay cómo estimar — se reporta aparte, no se inventa.
    const usd = c.total_usd ?? (c.trm && c.trm > 0 ? c.total_cop / c.trm : null)
    return usd == null ? null : Math.round(usd * 10)
  }
  return Math.floor(c.total_cop / 500)
}

function nivel(puntos: number, umbrales: number[]): { nivel: number; siguiente: number | null } {
  let n = 1
  for (let i = umbrales.length - 1; i >= 0; i--) {
    if (puntos >= umbrales[i]) { n = i + 1; break }
  }
  return { nivel: n, siguiente: n < umbrales.length ? umbrales[n] : null }
}

export function PuntosAdiclub({ compras }: { compras: CompraPuntos[] }) {
  const hace12m = new Date()
  hace12m.setFullYear(hace12m.getFullYear() - 1)
  const corte = hace12m.toISOString().slice(0, 10)

  type Acum = {
    correo: string
    tienda: 'usa' | 'colombia'
    puntos12m: number
    compras: number
    sinDatos: number       // compras USA sin USD ni TRM: no suman y se avisa
    ultima: string
  }
  const grupos = new Map<string, Acum>()
  let sinCorreo = 0

  for (const c of compras) {
    if (!c.correo) { sinCorreo++; continue }
    const clave = `${c.correo}|${c.tipo}`
    const g = grupos.get(clave) ?? {
      correo: c.correo, tienda: c.tipo, puntos12m: 0, compras: 0, sinDatos: 0, ultima: c.fecha,
    }
    g.compras += 1
    if (c.fecha > g.ultima) g.ultima = c.fecha
    const pts = puntosDe(c)
    if (pts == null) g.sinDatos += 1
    else if (c.fecha >= corte) g.puntos12m += pts
    grupos.set(clave, g)
  }

  const filas = [...grupos.values()].sort((a, b) => b.puntos12m - a.puntos12m)
  if (filas.length === 0 && sinCorreo === 0) return null

  return (
    <div className="mb-5 rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="border-b border-gray-100 bg-gray-50 px-4 py-2.5">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
          Puntos adiClub por correo <span className="normal-case text-gray-400">(estimado)</span>
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          10 pts/USD en USA · 10 pts por $5.000 en Colombia · nivel por los últimos 12 meses.
          El saldo oficial es el de la app de Adidas.
        </p>
      </div>

      {filas.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Correo</th>
                <th className="text-center px-4 py-2 text-xs font-medium text-gray-500 uppercase">Tienda</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">Puntos 12m</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Nivel</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Para subir</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Compras</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Última</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filas.map(f => {
                const umbrales = f.tienda === 'usa' ? NIVELES_US : NIVELES_CO
                const { nivel: n, siguiente } = nivel(f.puntos12m, umbrales)
                const pct = siguiente ? Math.min(100, (f.puntos12m / siguiente) * 100) : 100
                return (
                  <tr key={`${f.correo}|${f.tienda}`} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-900">{f.correo}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        f.tienda === 'usa' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                      }`}>
                        {f.tienda === 'usa' ? 'USA' : 'Colombia'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-gray-900 tabular-nums">
                      {f.puntos12m.toLocaleString('es-CO')}
                      {f.sinDatos > 0 && (
                        <span
                          className="ml-1 text-amber-600 font-normal text-xs"
                          title={`${f.sinDatos} compra(s) sin USD ni TRM: no se pudieron sumar`}
                        >
                          +?
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-semibold text-gray-900">Nivel {n}</span>
                    </td>
                    <td className="px-4 py-2.5 hidden sm:table-cell">
                      {siguiente ? (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 rounded-full bg-gray-100 overflow-hidden">
                            <div className="h-full rounded-full bg-gray-800" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-gray-500 tabular-nums whitespace-nowrap">
                            faltan {(siguiente - f.puntos12m).toLocaleString('es-CO')}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs font-semibold text-emerald-700">Nivel máximo</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-600 tabular-nums hidden md:table-cell">{f.compras}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 hidden md:table-cell whitespace-nowrap">{formatFecha(f.ultima)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-4 py-4 text-sm text-gray-400">
          Ninguna compra de adidas tiene correo todavía.
        </p>
      )}

      {sinCorreo > 0 && (
        <p className="border-t border-gray-100 bg-amber-50/60 px-4 py-2 text-xs text-amber-800">
          {sinCorreo} compra{sinCorreo !== 1 ? 's' : ''} de adidas sin correo — esos puntos no se
          están contando. Ábrelas con &ldquo;Ver → Editar&rdquo; y ponles el correo de la cuenta.
        </p>
      )}
    </div>
  )
}
