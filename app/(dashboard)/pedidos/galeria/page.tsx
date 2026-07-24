import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPedidos } from '@/lib/queries/pedidos'
import { GaleriaPedidos, type ItemGaleria } from '@/components/pedidos/GaleriaPedidos'
import { EstadoPedido, ESTADO_LABELS } from '@/types'
import { List, ChevronLeft, ChevronRight } from 'lucide-react'

// Cruza los artículos del pedido con las compras ya asignadas para saber
// cuáles piezas YA se compraron. El cruce va de lo exacto a lo aproximado:
// 1) mismo artículo del catálogo, 2) mismo código, 3) misma talla, 4) lo que
// quede en orden (para compras viejas sin código).
function marcarComprados(
  items: ItemGaleria[],
  compras: Array<{ codigo: string | null; talla: string | null; articulo_id: string | null; cantidad: number }>,
): void {
  const unidades: Array<{ codigo: string | null; talla: string | null; articulo_id: string | null; usada: boolean }> = []
  for (const c of compras) {
    for (let i = 0; i < (c.cantidad || 1); i++) {
      unidades.push({
        codigo: c.codigo?.trim().toUpperCase() || null,
        talla: c.talla?.trim().toLowerCase() || null,
        articulo_id: c.articulo_id ?? null,
        usada: false,
      })
    }
  }
  const restante = items.map(it => it.cantidad || 1)
  const pasadas: Array<(u: (typeof unidades)[0], it: ItemGaleria) => boolean> = [
    (u, it) => !!it.articulo_id && u.articulo_id === it.articulo_id,
    (u, it) => !!it.codigo && u.codigo === it.codigo.trim().toUpperCase(),
    (u, it) => !!it.talla && u.talla === it.talla.trim().toLowerCase(),
    () => true,
  ]
  for (const coincide of pasadas) {
    items.forEach((it, idx) => {
      while (restante[idx] > 0) {
        const u = unidades.find(u => !u.usada && coincide(u, it))
        if (!u) break
        u.usada = true
        restante[idx]--
      }
    })
  }
  items.forEach((it, idx) => { it.comprado = restante[idx] <= 0 })
}

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
  searchParams: Promise<{ estado?: string; q?: string; pagina?: string; desde?: string; hasta?: string }>
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
    fecha_desde: params.desde,
    fecha_hasta: params.hasta,
    pagina,
    porPagina: 30, // cuadrícula de 6 × 5 imágenes
    // Igual que la lista: el asesor ve su sede por defecto; al buscar, todas.
    ...(!esAdmin && usuario.sedes && !params.q ? { sede: (usuario.sedes as any).codigo } : {}),
  })
  const { pedidos, total, totalPaginas } = resultado

  // Artículos de los pedidos en pantalla (con su foto) + compras ya asignadas
  // (para pintar en verde las piezas que ya se compraron).
  const itemsPorPedido: Record<string, ItemGaleria[]> = {}
  if (pedidos.length > 0) {
    const ids = pedidos.map(p => p.id)
    const [{ data: items }, { data: compras }] = await Promise.all([
      supabase
        .from('pedido_items')
        .select('pedido_id, codigo, marca, descripcion, talla, cantidad, precio_venta, sexo, categoria, imagen_url, articulo_id, articulos(codigo, sexo, categoria)')
        .in('pedido_id', ids)
        .order('id'),
      supabase
        .from('compra_items')
        .select('pedido_id, codigo, talla, articulo_id, cantidad')
        .in('pedido_id', ids),
    ])
    for (const it of (items ?? []) as any[]) {
      const art = Array.isArray(it.articulos) ? it.articulos[0] : it.articulos
      ;(itemsPorPedido[it.pedido_id] ??= []).push({
        codigo: it.codigo ?? art?.codigo ?? null,
        marca: it.marca,
        descripcion: it.descripcion,
        talla: it.talla,
        cantidad: it.cantidad,
        precio_venta: it.precio_venta,
        sexo: it.sexo ?? art?.sexo ?? null,
        categoria: it.categoria ?? art?.categoria ?? null,
        imagen_url: it.imagen_url ?? null,
        articulo_id: it.articulo_id ?? null,
        comprado: false,
      })
    }
    const comprasPorPedido: Record<string, Array<{ codigo: string | null; talla: string | null; articulo_id: string | null; cantidad: number }>> = {}
    for (const c of (compras ?? []) as any[]) {
      ;(comprasPorPedido[c.pedido_id] ??= []).push(c)
    }
    for (const pid of Object.keys(itemsPorPedido)) {
      marcarComprados(itemsPorPedido[pid], comprasPorPedido[pid] ?? [])
    }
  }

  function urlCon(cambios: Record<string, string | undefined>) {
    const p = new URLSearchParams()
    const merged = { estado: params.estado, q: params.q, desde: params.desde, hasta: params.hasta, pagina: undefined as string | undefined, ...cambios }
    if (merged.estado) p.set('estado', merged.estado)
    if (merged.q) p.set('q', merged.q)
    if (merged.desde) p.set('desde', merged.desde)
    if (merged.hasta) p.set('hasta', merged.hasta)
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
          placeholder="Buscar número, cliente, teléfono o código del artículo…"
          className="flex-1 min-w-48 rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {/* Rango de fechas (fecha de creación del pedido) */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-400 font-medium">Desde</label>
          <input
            type="date"
            name="desde"
            defaultValue={params.desde ?? ''}
            className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <label className="text-xs text-gray-400 font-medium">Hasta</label>
          <input
            type="date"
            name="hasta"
            defaultValue={params.hasta ?? ''}
            className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors"
        >
          Filtrar
        </button>
        {(params.estado || params.q || params.desde || params.hasta) && (
          <Link
            href="/pedidos/galeria"
            className="px-4 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl bg-white hover:bg-gray-50 transition-colors"
          >
            Limpiar
          </Link>
        )}
      </form>

      {pedidos.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 px-6 py-16 text-center text-gray-400 text-sm">
          No hay pedidos con estos filtros
        </div>
      ) : (
        <GaleriaPedidos pedidos={pedidos} itemsPorPedido={itemsPorPedido} esAdmin={esAdmin} />
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
