import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSesion } from '@/lib/auth/acceso'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { formatCOP, hoyBogota } from '@/lib/utils/format'
import { METODO_PAGO_LABELS, MetodoPago } from '@/types'
import { GenerarAuditoriaButton } from '@/components/auditoria/GenerarAuditoriaButton'
import type { Hallazgo, InformeAuditoria } from '@/lib/auditoria/informe'

// Sede auditada por ahora: Santa Rosa. Para sumar otra: agregarla en
// app/api/cron/auditoria/route.ts (SEDES_AUDITADAS).
const SEDE = 'SR'
const NOMBRE_SEDE = 'Santa Rosa'

const COLUMNAS: Record<string, string> = {
  doc: 'Documento', cliente: 'Cliente', telefono: 'Teléfono', estado: 'Estado', valor: 'Valor',
  dias: 'Días', facturas: 'Facturas', ultimo_pago: 'Último pago', esperado: 'Esperado', contado: 'Contado',
  operacion: 'Operación', antes: 'Antes', despues: 'Después', usuario: 'Quién', hora: 'Hora', metodo: 'Método',
}
const MONEDA = new Set(['valor', 'esperado', 'contado', 'antes', 'despues'])

function celda(k: string, v: string | number | null) {
  if (v === null || v === undefined || v === '') return '—'
  if (MONEDA.has(k)) return formatCOP(Number(v))
  if (k === 'hora') return new Date(String(v)).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })
  if (k === 'metodo') return METODO_PAGO_LABELS[v as MetodoPago] ?? String(v)
  return String(v)
}

function Kpi({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500">{titulo}</p>
      <p className="text-xl font-bold text-gray-900 mt-0.5">{valor}</p>
      {nota && <p className="text-[11px] text-gray-400 mt-0.5">{nota}</p>}
    </div>
  )
}

function BloqueHallazgo({ h }: { h: Hallazgo }) {
  const claves = Object.keys(h.detalle[0] ?? {}).filter(k => k !== 'cliente_id')
  const alta = h.severidad === 'alta'
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${alta ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
            {alta ? '🔴 Alta' : '🟡 Media'}
          </span>
          <h2 className="text-sm font-semibold text-gray-900">{h.titulo}</h2>
          <span className="text-xs text-gray-500">
            {h.cantidad}{h.monto > 0 && h.codigo !== 'pagos_modificados' ? ` · ${formatCOP(h.monto)}` : ''}
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {claves.map(k => (
                  <th key={k} className={`px-4 py-2 text-xs font-medium text-gray-500 uppercase ${MONEDA.has(k) ? 'text-right' : 'text-left'}`}>{COLUMNAS[k] ?? k}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {h.detalle.map((fila, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  {claves.map(k => (
                    <td key={k} className={`px-4 py-2 ${MONEDA.has(k) ? 'text-right font-medium text-gray-900' : 'text-gray-700'}`}>
                      {k === 'cliente' && fila.cliente_id ? (
                        <Link href={`/clientes/${fila.cliente_id}`} className="text-blue-600 hover:underline">{celda(k, fila[k])}</Link>
                      ) : celda(k, fila[k])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {h.cantidad > h.detalle.length && (
          <p className="px-4 py-2 text-[11px] text-gray-400 border-t border-gray-100">Se muestran {h.detalle.length} de {h.cantidad}.</p>
        )}
      </CardContent>
    </Card>
  )
}

export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') redirect('/dashboard')

  const { fecha } = await searchParams
  const supabase = await createClient()
  const { data: sede } = await supabase.from('sedes').select('id').eq('codigo', SEDE).single()

  const { data: lista } = sede
    ? await supabase.from('auditoria_diaria').select('fecha, n_alta, n_media').eq('sede_id', sede.id).order('fecha', { ascending: false }).limit(21)
    : { data: [] as any[] }
  const dias = (lista ?? []) as Array<{ fecha: string; n_alta: number; n_media: number }>
  const elegida = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : dias[0]?.fecha

  const { data: fila } = sede && elegida
    ? await supabase.from('auditoria_diaria').select('informe, creado_en').eq('sede_id', sede.id).eq('fecha', elegida).maybeSingle()
    : { data: null }
  const informe = (fila?.informe ?? null) as InformeAuditoria | null
  const s = informe?.resumen
  const hoy = hoyBogota()

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Auditoría diaria · {NOMBRE_SEDE}</h1>
          <p className="text-sm text-gray-500">
            Revisa cada madrugada las ventas, los cobros, las facturas pendientes y las deudas. Solo lee: no cambia ningún dato.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <GenerarAuditoriaButton sede={SEDE} fecha={hoy} etiqueta="Auditar hoy" />
          {elegida && elegida !== hoy && <GenerarAuditoriaButton sede={SEDE} fecha={elegida} etiqueta={`Rehacer ${elegida}`} />}
        </div>
      </div>

      {dias.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {dias.map(d => (
            <Link
              key={d.fecha}
              href={`/auditoria?fecha=${d.fecha}`}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                d.fecha === elegida ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {d.fecha.slice(5)}{d.n_alta > 0 && ` 🔴${d.n_alta}`}{d.n_media > 0 && ` 🟡${d.n_media}`}
            </Link>
          ))}
        </div>
      )}

      {!informe || !s ? (
        <Card>
          <CardContent>
            <p className="py-6 text-sm text-gray-500 text-center">
              Todavía no hay informe{elegida ? ` del ${elegida}` : ''}. Pulsa <b>Auditar hoy</b> para generarlo; después se hará solo cada madrugada.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-xs text-gray-400">
            Informe del <b>{informe.fecha}</b> · generado {new Date(informe.generado).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}
          </p>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi titulo="Ventas del día (pedidos)" valor={formatCOP(s.pedidos_total)} nota={`${s.pedidos_n} pedidos`} />
            <Kpi titulo="Facturado en el día" valor={formatCOP(s.facturas_total)} nota={`${s.facturas_n} facturas`} />
            <Kpi
              titulo="Cobrado en el día"
              valor={formatCOP(s.cobros_total)}
              nota={Object.entries(s.cobros_por_metodo).map(([m, v]) => `${METODO_PAGO_LABELS[m as MetodoPago] ?? m}: ${formatCOP(v)}`).join(' · ') || 'Sin cobros'}
            />
            <Kpi
              titulo="Cierre de caja"
              valor={s.cierre?.contado != null ? (s.cierre.diferencia ? `Dif. ${formatCOP(s.cierre.diferencia)}` : 'Cuadró') : 'Sin conteo'}
              nota={s.cierre?.contado != null ? `Contado ${formatCOP(s.cierre.contado)}` : 'Nadie contó el efectivo'}
            />
          </div>

          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-gray-900">
                Deuda de facturas pendientes: {formatCOP(s.deuda_total)} <span className="font-normal text-gray-500">({s.deuda_facturas} facturas)</span>
              </h2>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><p className="text-xs text-gray-500">0 a 7 días</p><p className="font-semibold">{formatCOP(s.deuda_0_7)}</p></div>
                <div><p className="text-xs text-gray-500">8 a 15 días</p><p className="font-semibold">{formatCOP(s.deuda_8_15)}</p></div>
                <div><p className="text-xs text-gray-500">16 a 30 días</p><p className="font-semibold text-amber-700">{formatCOP(s.deuda_16_30)}</p></div>
                <div><p className="text-xs text-gray-500">Más de 30 días</p><p className="font-semibold text-red-700">{formatCOP(s.deuda_mas_30)}</p></div>
              </div>
            </CardContent>
          </Card>

          {s.por_asesor.length > 0 && (
            <p className="text-xs text-gray-500">
              Ventas del día por asesora: {s.por_asesor.map(a => `${a.asesor ?? 'Sin asesor'} ${formatCOP(a.total)} (${a.pedidos})`).join(' · ')}
            </p>
          )}

          {informe.hallazgos.length === 0 ? (
            <Card><CardContent><p className="py-6 text-sm text-green-700 text-center">✅ Sin hallazgos: todo en orden este día.</p></CardContent></Card>
          ) : (
            [...informe.hallazgos]
              .sort((a, b) => (a.severidad === b.severidad ? 0 : a.severidad === 'alta' ? -1 : 1))
              .map(h => <BloqueHallazgo key={h.codigo} h={h} />)
          )}
        </>
      )}
    </div>
  )
}
