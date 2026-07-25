import { getSesion } from '@/lib/auth/acceso'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { BadgeSegmento } from '@/components/recompras/BadgeSegmento'
import { PanelRFMCliente } from '@/components/recompras/PanelRFMCliente'
import { formatCOP, formatFecha } from '@/lib/utils/format'

export default async function RecomprasPage() {
  const sesion = await getSesion()

  // Solo admin
  if (sesion.rol !== 'admin') {
    redirect('/dashboard')
  }

  const supabase = await createClient()

  // Obtener clientes con RFM
  const { data: clientes } = await supabase
    .from('vista_rfm_clientes')
    .select(`
      cliente_id,
      nombre,
      telefono_normalizado,
      dias_desde_ultima_compra,
      frecuencia,
      monto_total,
      clientes!inner(segmento_rfm)
    `)
    .order('dias_desde_ultima_compra', { ascending: true })

  const clientesConSegmento = (clientes ?? []).map((c: any) => ({
    id: c.cliente_id,
    nombre: c.nombre,
    telefono: c.telefono_normalizado,
    r: c.dias_desde_ultima_compra,
    f: c.frecuencia,
    m: c.monto_total,
    segmento: c.clientes?.segmento_rfm || 'nuevo',
  }))

  // Agrupar por segmento
  const porSegmento: Record<string, typeof clientesConSegmento> = {}
  for (const c of clientesConSegmento) {
    if (!porSegmento[c.segmento]) porSegmento[c.segmento] = []
    porSegmento[c.segmento].push(c)
  }

  const orden = ['campeon', 'leal', 'potencial', 'nuevo', 'en_riesgo', 'dormido', 'perdido'] as const

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Recompra de Clientes</h1>
        <p className="mt-1 text-sm text-gray-600">Segmentación RFM por estado de actividad</p>
      </div>

      {orden.map(seg => {
        const clientes = porSegmento[seg] ?? []
        if (clientes.length === 0) return null

        return (
          <div key={seg} className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <BadgeSegmento segmento={seg as any} />
                  <span className="text-sm text-gray-600 font-medium">{clientes.length} clientes</span>
                </div>
              </div>
            </div>

            <div className="divide-y divide-gray-200">
              {clientes.map(c => (
                <Link
                  key={c.id}
                  href={`/clientes/${c.id}`}
                  className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{c.nombre}</div>
                    <div className="text-sm text-gray-600 mt-0.5">{c.telefono}</div>
                  </div>

                  <PanelRFMCliente r={c.r} f={c.f} m={c.m} />

                  <div className="ml-4 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={e => {
                        e.preventDefault()
                        // TODO: Abrir modal de WhatsApp después
                      }}
                      className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      📱 Contactar
                    </button>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )
      })}

      {Object.keys(porSegmento).length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
          <p className="text-gray-600">Sin clientes para recompra aún.</p>
        </div>
      )}
    </div>
  )
}
