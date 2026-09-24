import { redirect } from 'next/navigation'
import Link from 'next/link'
import { BotonVolver } from '@/components/ui/BotonVolver'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSesion } from '@/lib/auth/acceso'
import { formatCOP } from '@/lib/utils/format'
import { LinkNuevoForm } from '@/components/pedidos/LinkNuevoForm'
import { LinkNuevoAcciones } from '@/components/pedidos/LinkNuevoAcciones'

// "Link para cliente nuevo": la asesora arma el link solo con los productos;
// el cliente llena sus datos en Shopify y el pedido se crea solo (mig. 201).
// Abajo, los links recientes con su estado para que ninguno se pierda.

type ItemGuardado = { descripcion: string; marca: string; talla: string | null; cantidad: number; precio_venta: number }

type LinkRow = {
  id: string
  estado: 'pendiente' | 'confirmado' | 'sin_telefono'
  invoice_url: string
  draft_name: string | null
  items: ItemGuardado[] | null
  total: number | null
  notas: string | null
  creado_en: string
  confirmado_en: string | null
  datos_cliente: Record<string, string> | null
  shopify_order_name: string | null
  pedido_id: string | null
  sedes: { codigo: string } | null
  pedidos: { numero_orden: string } | null
}

function fechaCorta(iso: string) {
  return new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default async function LinkNuevoPage() {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') redirect('/pedidos')

  const supabase = await createClient()
  const { data: sedesData, error: errSedes } = await supabase.from('sedes').select('id, codigo, nombre').order('nombre')
  const sedes = (sedesData ?? []) as Array<{ id: string; codigo: string; nombre: string }>
  const sedesPermitidas = sesion.rol === 'admin' ? sedes : sedes.filter(s => s.id === sesion.sede_id)
  const sedeDefault = sesion.sede_id ?? sedes.find(s => s.codigo === 'TR')?.id ?? sedes[0]?.id ?? ''

  // Lista con admin: el embed de usuarios no pasa RLS para otros usuarios y
  // aquí se muestran links de toda la sede. El filtro por sede se aplica en
  // el servidor (asesor = su sede; admin = todas).
  const admin = createAdminClient()
  let consulta = admin
    .from('shopify_links')
    .select('id, estado, invoice_url, draft_name, items, total, notas, creado_en, confirmado_en, datos_cliente, shopify_order_name, pedido_id, sedes(codigo), pedidos(numero_orden)')
    .not('items', 'is', null)
    .order('creado_en', { ascending: false })
    .limit(30)
  if (sesion.rol !== 'admin' && sesion.sede_id) consulta = consulta.eq('sede_id', sesion.sede_id)
  // supabase-js nunca lanza: si la consulta falla hay que decirlo, no pintar
  // "no hay links" (la asesora generaría otro y quedarían dos checkouts).
  const { data: linksData, error: errLinks } = await consulta
  const links = (linksData ?? []) as unknown as LinkRow[]
  const errorCarga = errSedes?.message ?? errLinks?.message ?? null

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <BotonVolver href="/pedidos">Pedidos</BotonVolver>
        <span className="text-gray-300">/</span>
        <h1 className="text-lg font-bold text-gray-900">Link para cliente nuevo</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Escoge los productos y genera el link. El cliente llena sus datos en la página web y el
        pedido se crea solo, con su ficha, cuando confirma. Si el cliente ya está en el sistema,
        usa el botón "Generar link" dentro de su pedido.
      </p>

      {errorCarga && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudo cargar la página completa ({errorCarga}). Recarga antes de generar un link, para no duplicarlo.
        </p>
      )}

      <LinkNuevoForm sedes={sedesPermitidas} sedeDefault={sedeDefault} esAdmin={sesion.rol === 'admin'} esAsesor={sesion.rol === 'asesor'} />

      <div className="mt-8 bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-3 border-b border-gray-100">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Links generados recientes</p>
        </div>
        {errorCarga ? (
          <p className="px-5 py-6 text-sm text-red-600">No se pudieron cargar los links: {errorCarga}</p>
        ) : links.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-400">Todavía no hay links de cliente nuevo.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {links.map(l => {
              const items = l.items ?? []
              const resumen = items.map(it => `${it.cantidad > 1 ? `${it.cantidad}× ` : ''}${it.marca} ${it.descripcion}${it.talla ? ` T${it.talla}` : ''}`).join(' · ')
              const d = l.datos_cliente ?? {}
              return (
                <li key={l.id} className="px-5 py-3 flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-900 truncate" title={resumen}>{resumen || '—'}</p>
                    <p className="text-xs text-gray-400">
                      {fechaCorta(l.creado_en)} · {l.sedes?.codigo ?? ''} · {formatCOP(l.total ?? 0)}
                      {l.draft_name ? ` · ${l.draft_name}` : ''}
                      {l.notas ? ` · ${l.notas}` : ''}
                    </p>
                    {l.estado === 'sin_telefono' && (
                      <p className="mt-1 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-1">
                        ⚠ El cliente confirmó ({l.shopify_order_name ?? 'Shopify'}) pero el pedido no se pudo crear solo
                        {d.error ? ` (${d.error})` : ' (no dejó un celular válido)'}: créalo a mano con estos datos —{' '}
                        {[d.nombre, d.telefono ? `cel ${d.telefono}` : null, d.direccion, d.ciudad, d.email].filter(Boolean).join(' · ') || 'sin datos'}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {l.estado === 'pendiente' && (
                      <>
                        <span className="text-[11px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded-md px-2 py-1">Esperando al cliente</span>
                        <LinkNuevoAcciones url={l.invoice_url} compacto />
                      </>
                    )}
                    {l.estado === 'confirmado' && l.pedido_id && (
                      <Link
                        href={`/pedidos/${l.pedido_id}`}
                        className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1 hover:bg-emerald-100"
                      >
                        ✓ Pedido {l.pedidos?.numero_orden ?? ''} creado{d.nombre ? ` · ${d.nombre}` : ''}
                      </Link>
                    )}
                    {l.estado === 'sin_telefono' && (
                      <span className="text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-1">Sin celular</span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
