import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getCartera, getTotalCartera } from '@/lib/queries/cartera'
import { getDescuadresCartera } from '@/lib/queries/descuadres'
import { getDeudaPorSede } from '@/lib/queries/metricas'
import { formatCOP } from '@/lib/utils/format'
import { formatearTelefono } from '@/lib/utils/phone'
import { ClientesBusqueda } from '@/components/clientes/ClientesBusqueda'
import { CargarSaldoButton } from '@/components/cartera/CargarSaldoButton'

export default async function CarteraPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; pagina?: string; sede?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (!usuario || usuario.rol !== 'admin') redirect('/dashboard')

  const { data: sedesRaw } = await supabase.from('sedes').select('id, codigo, nombre').order('codigo')
  const sedes = (sedesRaw ?? []) as { id: string; codigo: string; nombre: string }[]

  const { q, pagina: paginaParam, sede: sedeParam } = await searchParams
  const pagina = Math.max(1, parseInt(paginaParam ?? '1', 10) || 1)
  // Validar la sede contra las sedes reales; si no es válida, se ignora el filtro.
  const sede = sedes.some(s => s.codigo === sedeParam) ? sedeParam : undefined
  const sedeNombre = sedes.find(s => s.codigo === sede)?.nombre
  const [resultado, carteraTotal, deudaSedes, descuadres] = await Promise.all([
    getCartera({ busqueda: q, pagina, sede }),
    getTotalCartera(sede),
    getDeudaPorSede(),
    getDescuadresCartera(),
  ])
  const { clientes, total, totalPaginas } = resultado
  // Con búsqueda o paginación las sumas globales no aplican: se suman las filas
  // visibles (igual que siempre hizo el saldo total).
  const usarGlobal = pagina === 1 && !q
  const totalSaldo = usarGlobal ? carteraTotal.saldo : resultado.totalSaldo
  const carteraFacturada = usarGlobal ? carteraTotal.entregado : resultado.totalEntregado
  const carteraPedidos = usarGlobal ? carteraTotal.proceso : resultado.totalProceso

  const desde = total === 0 ? 0 : (pagina - 1) * 30 + 1
  const hasta = Math.min(pagina * 30, total)

  function buildUrl(p: number) {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (sede) params.set('sede', sede)
    if (p > 1) params.set('pagina', p.toString())
    const qs = params.toString()
    return `/cartera${qs ? `?${qs}` : ''}`
  }

  // URL para el filtro por sede (preserva la búsqueda, reinicia la paginación).
  function sedeUrl(codigo: string | null) {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (codigo) params.set('sede', codigo)
    const qs = params.toString()
    return `/cartera${qs ? `?${qs}` : ''}`
  }
  const deudaPorCodigo = new Map(deudaSedes.map(d => [d.codigo, d.saldo]))

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Cartera</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {total === 0
              ? 'Sin saldos pendientes'
              : `${desde}–${hasta} de ${total} cliente${total !== 1 ? 's' : ''} con saldo`}
            {sede && ` · ${sedeNombre}`}
            {q && ` para "${q}"`}
          </p>
        </div>
        <CargarSaldoButton sedes={sedes} />
      </div>

      {/* Centinela: plata mal registrada que hace mentir la deuda de un cliente.
          Lo normal es que esto no aparezca nunca. */}
      {descuadres.length > 0 && (
        <div className="mb-6 rounded-xl border border-red-300 bg-red-50 p-4">
          <p className="text-sm font-bold text-red-800">
            ⚠ {descuadres.length} descuadre{descuadres.length !== 1 ? 's' : ''} de cartera
          </p>
          <p className="text-xs text-red-600 mt-0.5 mb-3">
            Hay plata mal registrada: la deuda de estos clientes no es confiable hasta corregirla.
          </p>
          <ul className="space-y-2">
            {descuadres.map((d, i) => (
              <li key={`${d.tipo}-${d.referencia}-${i}`} className="text-sm">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold text-red-700">{formatCOP(d.monto)}</span>
                  {d.cliente_id ? (
                    <Link href={`/clientes/${d.cliente_id}`} className="font-medium text-gray-900 hover:underline">
                      {d.cliente ?? 'Cliente sin nombre'}
                    </Link>
                  ) : (
                    <span className="font-medium text-gray-900">{d.cliente ?? 'Cliente sin nombre'}</span>
                  )}
                  {d.referencia && <span className="text-xs text-gray-500">· {d.referencia}</span>}
                </div>
                <p className="text-xs text-gray-600">
                  {d.descripcion}
                  {d.detalle && ` · ${d.detalle}`}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Resumen: la cartera partida en sus dos bolsillos + el total */}
      {total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">
              Clientes con saldo
            </p>
            <p className="text-2xl font-bold text-gray-900">{total}</p>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-xs text-red-500 font-medium uppercase tracking-wide mb-1">
              Cartera facturada
            </p>
            <p className="text-2xl font-bold text-red-700">{formatCOP(carteraFacturada)}</p>
            <p className="text-[10px] text-red-400 mt-0.5">entregado / facturado a crédito — deuda por cobrar ya</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs text-amber-600 font-medium uppercase tracking-wide mb-1">
              Cartera de pedidos
            </p>
            <p className="text-2xl font-bold text-amber-700">{formatCOP(carteraPedidos)}</p>
            <p className="text-[10px] text-amber-500 mt-0.5">pedidos sin entregar — se cobra al entregar</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">
              {sede ? `Cartera ${sedeNombre}` : (pagina > 1 || q ? 'Saldo (filtrado)' : 'Cartera total')}
            </p>
            <p className="text-2xl font-bold text-gray-900">{formatCOP(totalSaldo)}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">facturada + pedidos</p>
          </div>
        </div>
      )}

      {/* Filtro por sede — clic en una tarjeta filtra la cartera de esa sede */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Link
          href={sedeUrl(null)}
          className={`rounded-xl border p-4 transition-colors ${
            !sede ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-300' : 'border-gray-200 bg-white hover:border-blue-200'
          }`}
        >
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Todas las sedes</p>
          <p className="text-lg font-bold text-amber-700">{formatCOP(deudaSedes.reduce((s, d) => s + d.saldo, 0))}</p>
          <p className="text-[10px] text-gray-400">Total</p>
        </Link>
        {sedes.map(s => (
          <Link
            key={s.id}
            href={sedeUrl(s.codigo)}
            className={`rounded-xl border p-4 transition-colors ${
              sede === s.codigo ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-300' : 'border-gray-200 bg-white hover:border-blue-200'
            }`}
          >
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">{s.nombre}</p>
            <p className="text-lg font-bold text-amber-700">{formatCOP(deudaPorCodigo.get(s.codigo) ?? 0)}</p>
            <p className="text-[10px] text-gray-400">{s.codigo}</p>
          </Link>
        ))}
      </div>

      <div className="mb-4">
        <ClientesBusqueda valorInicial={q ?? ''} />
      </div>

      {clientes.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          {q ? `Sin resultados para "${q}"` : 'Todos los clientes están al día'}
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Cliente</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Teléfono</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Pedidos</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Total comprado</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Total pagado</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-red-600 uppercase" title="Pedidos ya entregados o facturados sin pagar — deuda real por cobrar">🚚 Entregado debe</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-amber-600 uppercase" title="Pedidos aún sin facturar/entregar — mercancía en camino">⏳ En proceso</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Saldo total</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {clientes.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">{c.nombre}</p>
                      {c.cedula && (
                        <p className="text-xs text-gray-400 mt-0.5">CC {c.cedula}</p>
                      )}
                    </td>
                    <td className="px-4 py-4 text-gray-600 hidden sm:table-cell">
                      {formatearTelefono(c.telefono_normalizado)}
                    </td>
                    <td className="px-4 py-4 text-center hidden md:table-cell">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-gray-700 text-xs font-semibold">
                        {c.pedidos_activos}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right text-gray-600 hidden md:table-cell">
                      {formatCOP(c.total_comprado)}
                    </td>
                    <td className="px-4 py-4 text-right text-green-700 hidden md:table-cell">
                      {formatCOP(c.total_pagado)}
                    </td>
                    <td className="px-4 py-4 text-right">
                      {c.saldo_entregado > 0 ? (
                        <>
                          <span className="font-bold text-red-600">{formatCOP(c.saldo_entregado)}</span>
                          <span className="block text-[10px] text-gray-400">{c.pedidos_entregados} entregado{c.pedidos_entregados !== 1 ? 's' : ''}</span>
                        </>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-4 text-right">
                      {c.saldo_proceso > 0 ? (
                        <>
                          <span className="font-semibold text-amber-600">{formatCOP(c.saldo_proceso)}</span>
                          <span className="block text-[10px] text-gray-400">{c.pedidos_proceso} en camino</span>
                        </>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="font-bold text-gray-900">{formatCOP(c.saldo)}</span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <Link
                        href={`/clientes/${c.id}`}
                        className="inline-block px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        Ver
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPaginas > 1 && (
            <div className="flex items-center justify-between pt-4">
              <Link
                href={buildUrl(pagina - 1)}
                aria-disabled={pagina === 1}
                className={`px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50 transition-colors ${
                  pagina === 1 ? 'opacity-40 pointer-events-none' : ''
                }`}
              >
                ← Anterior
              </Link>
              <span className="text-sm text-gray-500">
                Página {pagina} de {totalPaginas}
              </span>
              <Link
                href={buildUrl(pagina + 1)}
                aria-disabled={pagina >= totalPaginas}
                className={`px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50 transition-colors ${
                  pagina >= totalPaginas ? 'opacity-40 pointer-events-none' : ''
                }`}
              >
                Siguiente →
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  )
}
