import { getSesion } from '@/lib/auth/acceso'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { BadgeSegmento, SEGMENTO_CONFIG } from '@/components/recompras/BadgeSegmento'
import { FilaEtiquetar, CopiarEtiqueta, ClienteFila } from '@/components/recompras/FilaEtiquetar'
import { ClienteSegmentoRfm } from '@/types'
import { formatCOP } from '@/lib/utils/format'

// Orden de atención: primero a quien hay que perseguir.
const ORDEN: ClienteSegmentoRfm[] = [
  'campeon', 'leal', 'potencial', 'en_riesgo', 'dormido', 'nuevo', 'perdido',
]

// Tope por segmento: "nuevo" trae 400+ y renderizarlos todos hace la página
// impasable. Se avisa cuántos quedaron fuera — nunca recortar en silencio.
const TOPE = 60

export default async function RecomprasPage({
  searchParams,
}: {
  searchParams: Promise<{ pendientes?: string; vista?: string }>
}) {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') redirect('/dashboard')

  const { pendientes, vista } = await searchParams
  const soloPendientes = pendientes === '1'
  const esLista = vista === 'lista'

  const supabase = await createClient()

  // El segmento sale de la vista, no de clientes.segmento_rfm: la recencia
  // cambia con el paso del tiempo y la columna guardada se queda vieja (solo la
  // mueven los triggers de pedidos/pagos). Ver migración 137.
  const { data: filas, error } = await supabase
    .from('vista_rfm_clientes')
    .select('cliente_id, nombre, telefono_normalizado, dias_desde_ultima_compra, frecuencia, monto_total, segmento')
    .not('cliente_id', 'is', null)
    .order('dias_desde_ultima_compra', { ascending: false, nullsFirst: true })

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <p className="font-medium text-red-800">No se pudo cargar la segmentación</p>
          <p className="mt-1 text-sm text-red-700">{error.message}</p>
        </div>
      </div>
    )
  }

  // El avance del etiquetado vive en `clientes`, no en la vista: se trae en una
  // sola consulta y se cruza en memoria (no una consulta por fila).
  const { data: marcas } = await supabase
    .from('clientes')
    .select('id, etiquetado_whatsapp')

  const etiquetadoPorId = new Map(
    (marcas ?? []).map((m: any) => [m.id as string, (m.etiquetado_whatsapp ?? null) as string | null])
  )

  const clientes: Array<ClienteFila & { segmento: ClienteSegmentoRfm }> = (filas ?? []).map((c: any) => ({
    id: c.cliente_id as string,
    nombre: c.nombre as string,
    telefono: (c.telefono_normalizado ?? '') as string,
    r: c.dias_desde_ultima_compra as number | null,
    f: c.frecuencia as number | null,
    m: c.monto_total as number | null,
    segmento: (c.segmento ?? 'nuevo') as ClienteSegmentoRfm,
    etiquetado: etiquetadoPorId.get(c.cliente_id as string) ?? null,
  }))

  const porSegmento = new Map<ClienteSegmentoRfm, typeof clientes>()
  for (const c of clientes) {
    const lista = porSegmento.get(c.segmento) ?? []
    lista.push(c)
    porSegmento.set(c.segmento, lista)
  }

  const totalFaltan = clientes.filter(c => !c.etiquetado).length

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Recompra de clientes</h1>
          <p className="text-sm text-gray-500 mt-0.5 max-w-2xl">
            {esLista
              ? 'Clientes agrupados por categoría con el tiempo desde su última compra.'
              : 'Agrupa a tus clientes por comportamiento de los últimos 365 días para etiquetar en WhatsApp Business.'}
          </p>
        </div>
        {/* Toggle de vista */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 shrink-0">
          <Link
            href="/recompras?vista=lista"
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              esLista ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Lista
          </Link>
          <Link
            href="/recompras"
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              !esLista ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Etiquetado
          </Link>
        </div>
      </div>

      {/* ── VISTA LISTA: tabla limpia por segmento ── */}
      {esLista && (
        <div className="space-y-4">
          {ORDEN.map(seg => {
            const lista = porSegmento.get(seg) ?? []
            if (lista.length === 0) return null
            const cfg = SEGMENTO_CONFIG[seg]
            return (
              <div key={seg} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                  <BadgeSegmento segmento={seg} />
                  <span className="text-sm text-gray-500">{lista.length} cliente{lista.length !== 1 ? 's' : ''}</span>
                  <span className="text-xs text-gray-400 ml-1">— {cfg.queHacer}</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 border-b border-gray-100">
                      <th className="text-left px-4 py-2 font-medium">Cliente</th>
                      <th className="text-right px-4 py-2 font-medium">Sin comprar</th>
                      <th className="text-right px-4 py-2 font-medium">Compras</th>
                      <th className="text-right px-4 py-2 font-medium">Total año</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {lista.map(c => (
                      <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5">
                          <Link href={`/clientes/${c.id}`} className="font-medium text-gray-900 hover:text-blue-700 transition-colors">
                            {c.nombre}
                          </Link>
                          {c.telefono && (
                            <div className="text-xs text-gray-400 font-mono">{c.telefono}</div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {c.r === null || c.r >= 999
                            ? <span className="text-gray-400">—</span>
                            : <span className={`font-semibold ${c.r > 180 ? 'text-red-600' : c.r > 60 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                {c.r} días
                              </span>
                          }
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                          {c.f ?? '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                          {c.m ? formatCOP(c.m) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
          {clientes.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8">Sin clientes para mostrar.</p>
          )}
        </div>
      )}

      {/* ── VISTA ETIQUETADO (original) ── */}
      {!esLista && <>
      {/* Cómo se usa: WhatsApp no deja poner etiquetas desde afuera */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-3">
        <p className="text-sm font-semibold text-blue-900">Cómo etiquetar</p>
        <ol className="mt-1.5 space-y-1 text-sm text-blue-900/80 list-decimal list-inside">
          <li>Copia el nombre de la etiqueta del segmento (botón &ldquo;Copiar nombre&rdquo;).</li>
          <li>Toca <strong>Abrir chat</strong>: se abre WhatsApp en la conversación de ese cliente.</li>
          <li>En WhatsApp, mantén presionado el chat → <strong>Etiquetar</strong> → pega o elige la etiqueta.</li>
          <li>Vuelve aquí y marca la casilla, para saber por dónde ibas.</li>
        </ol>
        <p className="mt-2 text-xs text-blue-900/60">
          Las etiquetas de WhatsApp se ponen a mano: no existe forma de aplicarlas desde otro programa.
          Lo que sí hace el sistema es decirte a quién le va cuál.
        </p>
      </div>

      {/* Avance y filtro */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-gray-600">
          Faltan <strong className="text-gray-900 tabular-nums">{totalFaltan}</strong> de{' '}
          <span className="tabular-nums">{clientes.length}</span> clientes por etiquetar
        </span>
        <Link
          href={soloPendientes ? '/recompras' : '/recompras?pendientes=1'}
          className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
            soloPendientes
              ? 'bg-blue-600 border-blue-600 text-white'
              : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
          }`}
        >
          {soloPendientes ? 'Viendo solo los que faltan' : 'Ver solo los que faltan'}
        </Link>
      </div>

      {ORDEN.map(seg => {
        const todos = porSegmento.get(seg) ?? []
        if (todos.length === 0) return null

        const faltan = todos.filter(c => !c.etiquetado).length
        const lista = soloPendientes ? todos.filter(c => !c.etiquetado) : todos
        if (lista.length === 0) return null

        const visibles = lista.slice(0, TOPE)
        const cfg = SEGMENTO_CONFIG[seg]

        return (
          <div key={seg} id={`seg-${seg}`} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="border-b border-gray-100 bg-gray-50 px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <BadgeSegmento segmento={seg} />
              <span className="text-sm text-gray-500">
                {todos.length} {todos.length === 1 ? 'cliente' : 'clientes'}
                {faltan > 0 && <span className="text-gray-400"> · faltan {faltan}</span>}
              </span>
              <div className="flex-1" />
              <span className="text-xs text-gray-500">
                Etiqueta en WhatsApp: <strong className="text-gray-800">{cfg.etiquetaWhatsapp}</strong>
              </span>
              <CopiarEtiqueta texto={cfg.etiquetaWhatsapp} />
            </div>

            <p className="px-4 pt-2.5 text-xs text-gray-400">{cfg.queHacer}</p>

            <div className="mt-1 divide-y divide-gray-50">
              {visibles.map(c => (
                <FilaEtiquetar key={c.id} cliente={c} />
              ))}
            </div>

            {lista.length > TOPE && (
              <p className="px-4 py-2.5 text-xs text-gray-500 border-t border-gray-100 bg-gray-50/60">
                Se muestran {TOPE}, los de compra más antigua primero. Faltan {lista.length - TOPE} en este segmento.
              </p>
            )}
          </div>
        )
      })}

      {clientes.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 text-center">
          <p className="text-gray-500">Todavía no hay clientes con compras para segmentar.</p>
        </div>
      )}

      {soloPendientes && totalFaltan === 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <p className="font-medium text-emerald-800">Todos los clientes están etiquetados.</p>
        </div>
      )}
      </>}
    </div>
  )
}
