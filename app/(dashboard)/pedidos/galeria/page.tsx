import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPedidos } from '@/lib/queries/pedidos'
import { GaleriaPedidos } from '@/components/pedidos/GaleriaPedidos'
import { EstadoPedido, ESTADO_LABELS } from '@/types'
import { List, ChevronLeft, ChevronRight } from 'lucide-react'

const ESTADOS: Array<{ value: string; label: string }> = [
  { value: '',            label: 'Todos los estados' },
  { value: 'pendiente',   label: ESTADO_LABELS.pendiente },
  { value: 'comprado',    label: ESTADO_LABELS.comprado },
  { value: 'usa',         label: ESTADO_LABELS.usa },
  { value: 'bucaramanga', label: ESTADO_LABELS.bucaramanga },
  { value: 'santa_rosa',  label: ESTADO_LABELS.santa_rosa },
  { value: 'entregado',   label: ESTADO_LABELS.entregado },
]

// Galería: los pedidos como tarjetas con la foto del producto en grande.
export default async function GaleriaPedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; q?: string; pagina?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('rol, sede_id, sedes(codigo)')
    .eq('id', user.id)
    .single()
  if (!usuario) redirect('/login')

  const esAdmin = usuario.rol === 'admin'
  const params = await searchParams
  const pagina = Math.max(1, parseInt(params.pagina ?? '1', 10) || 1)

  const resultado = await getPedidos({
    estado: params.estado as EstadoPedido | undefined,
    q:      params.q,
    pagina,
    // Igual que la lista: el asesor ve su sede por defecto; al buscar, todas.
    ...(!esAdmin && usuario.sedes && !params.q ? { sede: (usuario.sedes as any).codigo } : {}),
  })
  const { pedidos, total, totalPaginas } = resultado

  // Artículos de los pedidos en pantalla (para el visor: códigos, tallas, etc.)
  const itemsPorPedido: Record<string, Array<{ codigo: string | null; marca: string; descripcion: string; talla: string | null; cantidad: number; precio_venta: number }>> = {}
  if (pedidos.length > 0) {
    const { data: items } = await supabase
      .from('pedido_items')
      .select('pedido_id, codigo, marca, descripcion, talla, cantidad, precio_venta, articulos(codigo)')
      .in('pedido_id', pedidos.map(p => p.id))
      .order('id')
    for (const it of (items ?? []) as any[]) {
      const art = Array.isArray(it.articulos) ? it.articulos[0] : it.articulos
      ;(itemsPorPedido[it.pedido_id] ??= []).push({
        codigo: it.codigo ?? art?.codigo ?? null,
        marca: it.marca,
        descripcion: it.descripcion,
        talla: it.talla,
        cantidad: it.cantidad,
        precio_venta: it.precio_venta,
      })
    }
  }

  function urlCon(cambios: Record<string, string | undefined>) {
    const p = new URLSearchParams()
    const merged = { estado: params.estado, q: params.q, pagina: undefined as string | undefined, ...cambios }
    if (merged.estado) p.set('estado', merged.estado)
    if (merged.q) p.set('q', merged.q)
    if (merged.pagina && merged.pagina !== '1') p.set('pagina', merged.pagina)
    const qs = p.toString()
    return `/pedidos/galeria${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Galería de pedidos</h1>
          <p className="text-sm text-gray-400 mt-0.5">{total} pedido{total !== 1 ? 's' : ''} · fotos en grande</p>
        </div>
        <Link
          href="/pedidos"
          className="inline-flex items-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-semibold px-4 py-2.5 rounded-2xl transition-colors"
        >
          <List size={15} />
          Ver como lista
        </Link>
      </div>

      {/* Filtros (GET, sin JS) */}
      <form method="get" className="flex gap-2 mb-5 flex-wrap">
        <select
          name="estado"
          defaultValue={params.estado ?? ''}
          className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
        </select>
        <input
          type="search"
          name="q"
          defaultValue={params.q ?? ''}
          placeholder="Buscar número, cliente o teléfono…"
          className="flex-1 min-w-48 rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors"
        >
          Filtrar
        </button>
      </form>

      {pedidos.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 px-6 py-16 text-center text-gray-400 text-sm">
          No hay pedidos con estos filtros
        </div>
      ) : (
        <GaleriaPedidos pedidos={pedidos} itemsPorPedido={itemsPorPedido} />
      )}

      {/* Paginación */}
      {totalPaginas > 1 && (
        <div className="flex items-center justify-between pt-5">
          <Link
            href={urlCon({ pagina: String(pagina - 1) })}
            aria-disabled={pagina === 1}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl bg-white text-gray-700 hover:bg-gray-50 transition-colors ${pagina === 1 ? 'opacity-40 pointer-events-none' : ''}`}
          >
            <ChevronLeft size={15} /> Anterior
          </Link>
          <span className="text-sm text-gray-400 font-medium">{pagina} / {totalPaginas}</span>
          <Link
            href={urlCon({ pagina: String(pagina + 1) })}
            aria-disabled={pagina >= totalPaginas}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl bg-white text-gray-700 hover:bg-gray-50 transition-colors ${pagina >= totalPaginas ? 'opacity-40 pointer-events-none' : ''}`}
          >
            Siguiente <ChevronRight size={15} />
          </Link>
        </div>
      )}
    </div>
  )
}
