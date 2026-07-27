import { getSesion } from '@/lib/auth/acceso'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { BadgeSegmento } from '@/components/recompras/BadgeSegmento'
import { PanelRFMCliente } from '@/components/recompras/PanelRFMCliente'
import { ClienteSegmentoRfm } from '@/types'

export default async function RecomprasPage() {
  const sesion = await getSesion()

  // Solo admin
  if (sesion.rol !== 'admin') {
    redirect('/dashboard')
  }

  const supabase = await createClient()

  // El segmento sale de la vista, no de clientes.segmento_rfm: la recencia
  // cambia con el paso del tiempo y la columna guardada se queda vieja (solo la
  // mueven los triggers de pedidos/pagos). Ver migración 137.
  const { data: clientes, error } = await supabase
    .from('vista_rfm_clientes')
    .select('cliente_id, nombre, telefono_normalizado, dias_desde_ultima_compra, frecuencia, monto_total, segmento')
    .not('cliente_id', 'is', null)
    .order('dias_desde_ultima_compra', { ascending: true, nullsFirst: false })

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <p className="font-medium text-red-800">No se pudo cargar la segmentación</p>
        <p className="mt-1 text-sm text-red-700">{error.message}</p>
      </div>
    )
  }

  const clientesConSegmento = (clientes ?? []).map((c: any) => ({
    id: c.cliente_id as string,
    nombre: c.nombre as string,
    telefono: c.telefono_normalizado as string,
    r: c.dias_desde_ultima_compra as number | null,
    f: c.frecuencia as number | null,
    m: c.monto_total as number | null,
    segmento: (c.segmento ?? 'nuevo') as ClienteSegmentoRfm,
  }))

  // Agrupar por segmento
  const porSegmento: Record<string, typeof clientesConSegmento> = {}
  for (const c of clientesConSegmento) {
    if (!porSegmento[c.segmento]) porSegmento[c.segmento] = []
    porSegmento[c.segmento].push(c)
  }

  // Orden de atención: primero a quien hay que perseguir, después el resto.
  const orden: ClienteSegmentoRfm[] = [
    'potencial', 'en_riesgo', 'dormido', 'perdido', 'campeon', 'leal', 'nuevo',
  ]

  // Tope por segmento: "nuevo" trae 400+ y renderizarlos todos hace la página
  // impasable. Se avisa cuántos quedaron fuera — nunca recortar en silencio.
  const TOPE = 50

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Recompra de clientes</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Segmentación RFM: qué tan reciente compró, cuántas veces y cuánto, sobre los últimos 365 días.
          Se calcula en vivo cada vez que abres la página.
        </p>
      </div>

      {/* Resumen: cuántos hay en cada segmento */}
      <div className="flex flex-wrap gap-2">
        {orden.map(seg => {
          const n = (porSegmento[seg] ?? []).length
          if (n === 0) return null
          return (
            <a
              key={seg}
              href={`#seg-${seg}`}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 hover:border-gray-300 transition-colors"
            >
              <BadgeSegmento segmento={seg} />
              <span className="text-sm font-bold text-gray-900 tabular-nums">{n}</span>
            </a>
          )
        })}
      </div>

      {orden.map(seg => {
        const lista = porSegmento[seg] ?? []
        if (lista.length === 0) return null
        const visibles = lista.slice(0, TOPE)

        return (
          <div key={seg} id={`seg-${seg}`} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="bg-gray-50 px-6 py-3 border-b border-gray-100 flex items-center gap-3">
              <BadgeSegmento segmento={seg} />
              <span className="text-sm text-gray-500">
                {lista.length} {lista.length === 1 ? 'cliente' : 'clientes'}
              </span>
            </div>

            <div className="divide-y divide-gray-50">
              {visibles.map(c => (
                <div key={c.id} className="flex flex-wrap items-center gap-3 px-6 py-3 hover:bg-gray-50 transition-colors">
                  <Link href={`/clientes/${c.id}`} className="flex-1 min-w-[12rem] group">
                    <div className="font-medium text-gray-900 group-hover:text-blue-700 truncate">{c.nombre}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{c.telefono}</div>
                  </Link>

                  <PanelRFMCliente r={c.r} f={c.f} m={c.m} />

                  {c.telefono && (
                    <a
                      href={`https://wa.me/${c.telefono.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
                    >
                      WhatsApp
                    </a>
                  )}
                </div>
              ))}
            </div>

            {lista.length > TOPE && (
              <p className="px-6 py-2.5 text-xs text-gray-500 border-t border-gray-100 bg-gray-50/60">
                Se muestran los {TOPE} de compra más antigua. Faltan {lista.length - TOPE} en este segmento.
              </p>
            )}
          </div>
        )
      })}

      {clientesConSegmento.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 text-center">
          <p className="text-gray-500">Todavía no hay clientes con compras para segmentar.</p>
        </div>
      )}
    </div>
  )
}
