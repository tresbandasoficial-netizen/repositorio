import { Trophy, Gift } from 'lucide-react'
import { getSesion } from '@/lib/auth/acceso'
import { getRetos } from '@/lib/queries/retos'
import { hoyBogota, formatFecha } from '@/lib/utils/format'
import { CrearRetoForm } from '@/components/retos/CrearRetoForm'
import { RetoAcciones } from '@/components/retos/RetoAcciones'
import { RankingReto, etiquetaMeta } from '@/components/retos/RetoUI'

// El avance se calcula al vuelo desde los pedidos: no se debe cachear.
export const dynamic = 'force-dynamic'

const NOMBRE_SEDE: Record<string, string> = {
  TR: 'Bucaramanga',
  SR: 'Santa Rosa',
  CR: 'Cúcuta',
}

export default async function RetosPage() {
  const sesion = await getSesion()
  const esAdmin = sesion.rol === 'admin'
  const retos = await getRetos()
  const hoy = hoyBogota()

  const vigentes = retos.filter(r => r.reto.activo && r.reto.desde <= hoy && r.reto.hasta >= hoy)
  const otros = retos.filter(r => !vigentes.includes(r))

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <Trophy size={20} className="text-violet-600" />
        <h1 className="text-lg font-bold text-gray-900">Retos</h1>
      </div>

      {esAdmin && <CrearRetoForm />}

      {vigentes.length === 0 && otros.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <p className="text-sm text-gray-500">
            {esAdmin ? 'Todavía no has creado ningún reto.' : 'No hay retos por ahora.'}
          </p>
        </div>
      )}

      {[
        { titulo: 'En curso', grupo: vigentes },
        { titulo: 'Anteriores', grupo: otros },
      ].map(({ titulo, grupo }) => grupo.length === 0 ? null : (
        <div key={titulo} className="space-y-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1">{titulo}</p>

          {grupo.map(({ reto, avances }) => {
            const ganador = avances.find(a => a.completado_en !== null)
            const unDia = reto.desde === reto.hasta
            return (
              <div key={reto.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <h2 className="text-base font-bold text-gray-900">{reto.titulo}</h2>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Meta de cada uno: <span className="font-semibold text-gray-700">
                          {etiquetaMeta(reto.metrica, reto.categoria, reto.objetivo)}
                        </span>
                        {' · '}
                        {unDia ? formatFecha(reto.desde) : `${formatFecha(reto.desde)} → ${formatFecha(reto.hasta)}`}
                        {' · '}
                        {reto.sedes.length === 0
                          ? 'todas las sedes'
                          : reto.sedes.map(s => NOMBRE_SEDE[s] ?? s).join(' y ')}
                      </p>
                    </div>
                    {!reto.activo && (
                      <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-full shrink-0">
                        Cerrado
                      </span>
                    )}
                  </div>

                  {(reto.descripcion || reto.premio || reto.imagen_url) && (
                    <div className="flex items-start gap-3 bg-gray-50 rounded-xl p-3">
                      {reto.imagen_url && (
                        <a href={reto.imagen_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                          <img
                            src={reto.imagen_url}
                            alt="Premio"
                            loading="lazy"
                            className="w-20 h-20 rounded-xl object-cover border border-gray-200"
                          />
                        </a>
                      )}
                      <div className="min-w-0 flex-1">
                        {reto.descripcion && (
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{reto.descripcion}</p>
                        )}
                        {reto.premio && (
                          <p className="text-sm font-semibold text-amber-700 mt-1.5 flex items-start gap-1.5">
                            <Gift size={14} className="shrink-0 mt-0.5" />
                            <span>{reto.premio}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {ganador && (
                    <p className="text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                      🏆 {ganador.nombre} fue el primero en completarlo
                    </p>
                  )}

                  <RankingReto
                    avances={avances}
                    objetivo={reto.objetivo}
                    metrica={reto.metrica}
                    categoria={reto.categoria}
                    usuarioId={sesion.id}
                  />

                  {esAdmin && <RetoAcciones retoId={reto.id} activo={reto.activo} />}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
