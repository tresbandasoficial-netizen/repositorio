import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCOP, formatFecha } from '@/lib/utils/format'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Compra } from '@/types'
import { PuntosAdiclub } from '@/components/compras/PuntosAdiclub'
import { PanelColapsable } from '@/components/ui/PanelColapsable'
import { AsignacionesPendientes, AsignacionPendienteUI } from '@/components/compras/AsignacionesPendientes'
import { terminoBusquedaSeguro } from '@/lib/utils/busqueda'

export default async function ComprasPage({
  searchParams,
}: {
  searchParams: Promise<{ proveedor?: string; q?: string }>
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

  // Sugerencias compra→pedido esperando confirmación del admin (mig. 185).
  const { data: asigRaw } = await supabase
    .from('asignaciones_pendientes')
    .select(`
      id, creado_en, pedido_id,
      compra_item:compra_items (compra_id, descripcion, marca, talla, codigo, costo_unitario_cop,
        compras (numero_factura, proveedor, llegada_en)),
      pedido:pedidos (numero_orden, estado, clientes (nombre))
    `)
    .eq('estado', 'pendiente')
    .order('creado_en', { ascending: true })

  // Un pedido cancelado o entregado ya no recibe compra: esas sugerencias no
  // se muestran (y si se intentara confirmarlas, la acción las descarta sola).
  const asignaciones: AsignacionPendienteUI[] = ((asigRaw ?? []) as any[]).map(a => {
    const item = Array.isArray(a.compra_item) ? a.compra_item[0] : a.compra_item
    const compra = item ? (Array.isArray(item.compras) ? item.compras[0] : item.compras) : null
    const pedido = Array.isArray(a.pedido) ? a.pedido[0] : a.pedido
    const cliente = pedido ? (Array.isArray(pedido.clientes) ? pedido.clientes[0] : pedido.clientes) : null
    const talla = (item?.talla ?? '').trim().toUpperCase()
    return {
      id:           a.id,
      pedidoId:     a.pedido_id,
      pedidoNumero: pedido?.numero_orden ?? '¿?',
      pedidoEstado: pedido?.estado ?? '¿?',
      cliente:      cliente?.nombre ?? null,
      articulo:     `${item?.marca ?? ''} ${item?.descripcion ?? ''}${talla ? ` · T${talla}` : ''}`.trim(),
      codigo:       item?.codigo ?? null,
      costo:        item?.costo_unitario_cop ?? 0,
      compraId:     item?.compra_id ?? '',
      factura:      `${compra?.numero_factura ?? 's/n'} (${compra?.proveedor ?? '¿?'})`,
      llego:        Boolean(compra?.llegada_en),
      creadoEn:     a.creado_en,
    }
  }).filter(a => a.pedidoEstado !== 'cancelado' && a.pedidoEstado !== 'entregado')

  const { proveedor: filtroParam, q: qParam } = await searchParams
  // Se compara en minúsculas: si en la base quedó alguna escritura distinta, el
  // filtro igual la agarra.
  const filtro = filtroParam?.trim().toLowerCase() || null
  const q = qParam?.trim() || null

  const { data: compras } = await supabase
    .from('compras')
    .select(`
      id, tipo, proveedor, fecha, total_usd, trm, total_cop, notas, correo, numero_factura, creado_por, creado_en,
      compra_items(id)
    `)
    .order('fecha', { ascending: false })
    .order('creado_en', { ascending: false })

  const todas = (compras ?? []) as (Compra & { compra_items: { id: string }[]; numero_factura: string | null })[]

  // Marcas: la vista viene desglosada por marca Y proveedor, así que la tabla
  // respeta el filtro de proveedor de arriba.
  const { data: marcasRaw } = await supabase
    .from('vista_compras_por_marca')
    .select('marca, proveedor, unidades, invertido, facturas, ultima_compra')

  const marcasAgrupadas = new Map<string, {
    marca: string; unidades: number; invertido: number
    facturas: number; ultima: string | null; proveedores: Set<string>
  }>()
  for (const m of (marcasRaw ?? []) as any[]) {
    if (filtro && (m.proveedor ?? '').trim().toLowerCase() !== filtro) continue
    const g = marcasAgrupadas.get(m.marca) ?? {
      marca: m.marca as string, unidades: 0, invertido: 0, facturas: 0,
      ultima: null as string | null, proveedores: new Set<string>(),
    }
    g.unidades  += m.unidades ?? 0
    g.invertido += Number(m.invertido ?? 0)
    g.facturas  += m.facturas ?? 0
    if (m.proveedor) g.proveedores.add(m.proveedor)
    if (m.ultima_compra && (!g.ultima || m.ultima_compra > g.ultima)) g.ultima = m.ultima_compra
    marcasAgrupadas.set(m.marca, g)
  }
  const marcas = [...marcasAgrupadas.values()].sort((a, b) => b.invertido - a.invertido)
  const invertidoMarcas = marcas.reduce((s, m) => s + m.invertido, 0)

  // Resumen por proveedor para los botones: cuántas facturas y cuánto se le ha
  // comprado. Se agrupa sin distinguir mayúsculas y queda la escritura más usada.
  const grupos = new Map<string, { escrituras: Map<string, number>; compras: number; total: number }>()
  for (const c of todas) {
    const nombre = c.proveedor?.trim()
    if (!nombre) continue
    const clave = nombre.toLowerCase()
    const g = grupos.get(clave) ?? { escrituras: new Map<string, number>(), compras: 0, total: 0 }
    g.escrituras.set(nombre, (g.escrituras.get(nombre) ?? 0) + 1)
    g.compras += 1
    g.total += c.total_cop ?? 0
    grupos.set(clave, g)
  }
  const proveedores = [...grupos.entries()]
    .map(([clave, g]) => ({
      clave,
      nombre: [...g.escrituras.entries()].sort((a, b) => b[1] - a[1])[0][0],
      compras: g.compras,
      total: g.total,
    }))
    .sort((a, b) => b.total - a.total)   // primero al que más le compras

  // ── Buscador: por pedido asignado, por artículo o por número de compra ─────
  // Junta los ids de compra que coinciden por cualquiera de las tres vías y
  // guarda POR QUÉ coincidió cada una para mostrarlo en la fila.
  let idsBusqueda: Set<string> | null = null
  const motivos = new Map<string, string[]>()
  const agregarMatch = (compraId: string, motivo: string) => {
    idsBusqueda!.add(compraId)
    const lista = motivos.get(compraId) ?? []
    if (!lista.includes(motivo) && lista.length < 3) lista.push(motivo)
    motivos.set(compraId, lista)
  }
  if (q) {
    idsBusqueda = new Set<string>()
    const bq = terminoBusquedaSeguro(q)

    // 1. Número de la factura de compra (sobre las compras ya cargadas)
    const qLower = q.toLowerCase()
    for (const c of todas) {
      if (c.numero_factura && c.numero_factura.toLowerCase().includes(qLower)) {
        agregarMatch(c.id, `factura ${c.numero_factura}`)
      }
    }

    // 2. Artículos de la compra (descripción, código o marca)
    if (bq.length >= 2) {
      const { data: itemsArt } = await supabase
        .from('compra_items')
        .select('compra_id, descripcion, marca, talla')
        .or(`descripcion.ilike.%${bq}%,codigo.ilike.%${bq}%,marca.ilike.%${bq}%`)
        .limit(500)
      for (const it of (itemsArt ?? []) as any[]) {
        const talla = (it.talla ?? '').trim()
        agregarMatch(it.compra_id, `${it.marca ?? ''} ${it.descripcion ?? ''}${talla ? ` T${talla}` : ''}`.trim())
      }
    }

    // 3. Pedidos asignados a la compra (por número de orden)
    const { data: peds } = await supabase
      .from('pedidos')
      .select('id, numero_orden')
      .ilike('numero_orden', `%${q}%`)
      .limit(100)
    if (peds && peds.length > 0) {
      const numeroPorId = new Map(peds.map(p => [p.id, p.numero_orden]))
      const { data: itemsPed } = await supabase
        .from('compra_items')
        .select('compra_id, pedido_id')
        .in('pedido_id', peds.map(p => p.id))
      for (const it of (itemsPed ?? []) as any[]) {
        agregarMatch(it.compra_id, `pedido ${numeroPorId.get(it.pedido_id) ?? ''}`.trim())
      }
    }
  }

  const filas = todas
    .filter(c => !filtro || (c.proveedor ?? '').trim().toLowerCase() === filtro)
    .filter(c => !idsBusqueda || idsBusqueda.has(c.id))

  const totalFiltrado = filas.reduce((s, c) => s + (c.total_cop ?? 0), 0)
  const nombreFiltro = proveedores.find(p => p.clave === filtro)?.nombre ?? filtroParam

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Compras</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {todas.length === 0
              ? 'Sin compras registradas'
              : q
                ? `${filas.length} resultado${filas.length !== 1 ? 's' : ''} para «${q}» · ${formatCOP(totalFiltrado)}`
                : filtro
                  ? `${filas.length} de ${todas.length} facturas · ${nombreFiltro} · ${formatCOP(totalFiltrado)}`
                  : `${todas.length} factura${todas.length !== 1 ? 's' : ''} de compra · ${formatCOP(totalFiltrado)}`}
          </p>
        </div>
        <Link href="/compras/nueva">
          <Button>+ Nueva compra</Button>
        </Link>
      </div>

      {/* Sugerencias compra→pedido por confirmar — nada se asigna solo */}
      <AsignacionesPendientes filas={asignaciones} />

      {/* Buscador: pedido asignado (TR7467), artículo (falda, W6746R) o nº de compra */}
      <form action="/compras" method="get" className="mb-4 flex gap-2 items-center">
        {filtro && <input type="hidden" name="proveedor" value={filtro} />}
        <input
          type="text"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Buscar por pedido (TR7467), artículo o número de compra…"
          className="flex-1 max-w-xl px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <Button type="submit">Buscar</Button>
        {q && (
          <Link
            href={filtro ? `/compras?proveedor=${encodeURIComponent(filtro)}` : '/compras'}
            className="px-3 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors"
          >
            Limpiar
          </Link>
        )}
      </form>

      {/* Filtro por proveedor: ordenados por cuánto se les compra */}
      {proveedores.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          <Link
            href="/compras"
            className={`rounded-xl border px-3 py-1.5 text-sm transition-colors ${
              !filtro
                ? 'bg-blue-600 border-blue-600 text-white font-semibold'
                : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            Todos <span className="tabular-nums opacity-80">({todas.length})</span>
          </Link>
          {proveedores.map(p => {
            const activo = filtro === p.clave
            return (
              <Link
                key={p.clave}
                href={activo ? '/compras' : `/compras?proveedor=${encodeURIComponent(p.clave)}`}
                title={`${p.compras} facturas · ${formatCOP(p.total)} comprados`}
                className={`rounded-xl border px-3 py-1.5 text-sm transition-colors ${
                  activo
                    ? 'bg-blue-600 border-blue-600 text-white font-semibold'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {p.nombre} <span className="tabular-nums opacity-80">({p.compras})</span>
              </Link>
            )
          })}
        </div>
      )}

      {/* Puntos adiClub por correo: sale cuando se filtra por adidas o cuando
          no hay filtro (resumen general). Con otro proveedor filtrado no aplica.
          Oculto tras un botón para no ocupar la pantalla (20-ago-2026). */}
      {(!filtro || filtro === 'adidas') && (
        <PanelColapsable titulo="🏅 Puntos adiClub">
        <PuntosAdiclub
          compras={todas
            .filter(c => (c.proveedor ?? '').trim().toLowerCase() === 'adidas')
            .map(c => ({
              correo: (c as any).correo ?? null,
              tipo: c.tipo as 'usa' | 'colombia',
              fecha: c.fecha,
              total_cop: c.total_cop ?? 0,
              total_usd: c.total_usd != null ? Number(c.total_usd) : null,
              trm: (c as any).trm != null ? Number((c as any).trm) : null,
            }))}
        />
        </PanelColapsable>
      )}

      {/* Qué marcas se compran más — oculto tras un botón (20-ago-2026). */}
      {marcas.length > 0 && (
        <PanelColapsable titulo={`📊 Marcas que más compras · ${formatCOP(invertidoMarcas)}`}>
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="border-b border-gray-100 bg-gray-50 px-4 py-2.5 flex flex-wrap items-baseline gap-x-3">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Marcas que más compras
            </p>
            {filtro && <span className="text-xs text-gray-400">solo {nombreFiltro}</span>}
            <div className="flex-1" />
            <span className="text-xs text-gray-400 tabular-nums">{formatCOP(invertidoMarcas)} en total</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Marca</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">Invertido</th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase w-32">Peso</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">Unid.</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Costo prom.</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">Proveedores</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Última</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {marcas.map(m => {
                  const pct = invertidoMarcas > 0 ? (m.invertido / invertidoMarcas) * 100 : 0
                  return (
                    <tr key={m.marca} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">{m.marca}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                        {formatCOP(m.invertido)}
                      </td>
                      <td className="px-4 py-2.5">
                        {/* La barra deja ver de un vistazo dónde está la plata */}
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-gray-100 overflow-hidden">
                            <div className="h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-gray-400 tabular-nums w-10 text-right">{pct.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-700 tabular-nums">{m.unidades}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600 tabular-nums hidden sm:table-cell whitespace-nowrap">
                        {m.unidades > 0 ? formatCOP(Math.round(m.invertido / m.unidades)) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 hidden lg:table-cell max-w-xs truncate">
                        {[...m.proveedores].join(', ')}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 hidden md:table-cell whitespace-nowrap">
                        {m.ultima ? formatFecha(m.ultima) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        </PanelColapsable>
      )}

      {filas.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          {todas.length === 0
            ? 'Aún no hay compras registradas'
            : q
              ? `Ninguna compra coincide con «${q}» — busca por número de pedido, artículo o número de factura`
              : `Sin compras de ${nombreFiltro}`}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Fecha</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Proveedor</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">País</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Total COP</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Items</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filas.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-gray-700 whitespace-nowrap">
                    {new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(c.fecha + 'T12:00:00'))}
                  </td>
                  <td className="px-4 py-4">
                    {/* El nombre lleva al filtro: se puede saltar de una compra a
                        todas las de ese proveedor sin subir a los botones. */}
                    <Link
                      href={`/compras?proveedor=${encodeURIComponent((c.proveedor ?? '').trim().toLowerCase())}`}
                      className="font-medium text-gray-900 hover:text-blue-700 hover:underline"
                    >
                      {c.proveedor}
                    </Link>
                    {c.numero_factura && (
                      <p className="text-xs text-gray-400 font-mono mt-0.5">#{c.numero_factura}</p>
                    )}
                    {c.notas && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{c.notas}</p>
                    )}
                    {/* Por qué coincidió con la búsqueda */}
                    {q && (motivos.get(c.id) ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(motivos.get(c.id) ?? []).map((m, i) => (
                          <span key={i} className="inline-block rounded-full bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5 text-[11px]">
                            {m}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <Badge className={c.tipo === 'usa' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}>
                      {c.tipo === 'usa' ? 'USA' : 'Colombia'}
                    </Badge>
                  </td>
                  <td className="px-4 py-4 text-right font-medium text-gray-900 hidden md:table-cell tabular-nums">
                    {formatCOP(c.total_cop)}
                  </td>
                  <td className="px-4 py-4 text-center hidden sm:table-cell">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-gray-700 text-xs font-semibold">
                      {c.compra_items.length}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <Link
                      href={`/compras/${c.id}`}
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
      )}
    </div>
  )
}
