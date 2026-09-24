import { redirect } from 'next/navigation'
import { BotonVolver } from '@/components/ui/BotonVolver'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSesion } from '@/lib/auth/acceso'
import { formatCOP } from '@/lib/utils/format'

// Admin: ve todos los traslados/consignaciones con nombre del responsable.
// Asesor: ve solo los suyos (filtro por responsable_id = sesion.id).

type CuentaRef = { nombre: string; tipo: string }

type Traslado = {
  id: string
  monto: number
  fecha: string
  notas: string | null
  creado_en: string
  origen: CuentaRef | null
  destino: CuentaRef
  responsable: { nombre: string } | null
}

function fechaCorta(iso: string) {
  return new Date(iso).toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const TIPOS_BANCO = ['bancolombia', 'nequi', 'daviplata', 'bold', 'otro']
const TIPOS_EFECTIVO = ['efectivo']

function etiqueta(origen: CuentaRef | null, destino: CuentaRef) {
  if (origen && TIPOS_EFECTIVO.includes(origen.tipo) && TIPOS_BANCO.includes(destino.tipo))
    return 'Consignación'
  return 'Traslado'
}

export default async function MisMovimientosPage() {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') redirect('/dashboard')

  const esAdmin = sesion.rol === 'admin'
  // Admin usa client con privilegios para poder leer usuarios (join).
  const client = esAdmin ? createAdminClient() : await createClient()
  let consulta = client
    .from('traslados_caja')
    .select(`
      id, monto, fecha, notas, creado_en,
      origen:origen_cuenta_id(nombre, tipo),
      destino:destino_cuenta_id(nombre, tipo),
      responsable:responsable_id(nombre)
    `)
    .order('creado_en', { ascending: false })
    .limit(200)

  if (!esAdmin) consulta = consulta.eq('responsable_id', sesion.id)

  const { data, error } = await consulta
  const traslados = (data ?? []) as unknown as Traslado[]

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <BotonVolver href="/gastos">Gastos</BotonVolver>
        <span className="text-gray-300">/</span>
        <h1 className="text-lg font-bold text-gray-900">Mis movimientos de caja</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        {esAdmin
          ? 'Todos los traslados y consignaciones del equipo, más recientes primero.'
          : 'Traslados y consignaciones que has registrado. Solo los tuyos, más recientes primero.'}
      </p>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudo cargar ({error.message}).
        </p>
      )}

      <div className="bg-white rounded-xl border border-gray-200">
        {traslados.length === 0 && !error ? (
          <p className="px-5 py-8 text-sm text-gray-400 text-center">
            Todavía no tienes movimientos registrados.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {traslados.map(t => {
              const tipo = etiqueta(t.origen, t.destino)
              const esConsignacion = tipo === 'Consignación'
              return (
                <li key={t.id} className="px-5 py-3 flex items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {t.origen ? t.origen.nombre : 'Ingreso externo'}{' '}
                      <span className="text-gray-400">→</span>{' '}
                      {t.destino.nombre}
                    </p>
                    {(esAdmin && t.responsable) && (
                      <p className="text-xs text-blue-600 font-medium mt-0.5">{t.responsable.nombre}</p>
                    )}
                    {t.notas && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate" title={t.notas}>{t.notas}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">{fechaCorta(t.creado_en)}</p>
                  </div>
                  <div className="shrink-0 text-right space-y-1">
                    <p className="text-sm font-bold text-gray-900 tabular-nums">{formatCOP(t.monto)}</p>
                    <span className={`inline-block text-[11px] font-semibold rounded-md px-2 py-0.5 ${
                      esConsignacion
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : 'bg-blue-50 text-blue-700 border border-blue-200'
                    }`}>
                      {tipo}
                    </span>
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
