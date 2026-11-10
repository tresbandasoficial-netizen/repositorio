import { redirect } from 'next/navigation'
import { getSesion } from '@/lib/auth/acceso'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { formatCOP } from '@/lib/utils/format'
import { calcularMisionNavidad, META } from '@/lib/mision-navidad'

// Misión Navidad — la cuenta y las reglas viven en lib/mision-navidad.ts (y en la función SQL
// mision_navidad, migración 217). Solo LEE.
//
// Quién la ve (10-nov): el administrador ve todo (crédito y por facturar de cada asesora);
// cada asesora ve el avance del equipo, SU propio avance y el ranking con lo que cuenta de
// cada una (sin el crédito ni lo pendiente de las demás). El visor no la ve.

function Kpi({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500">{titulo}</p>
      <p className="text-xl font-bold text-gray-900 mt-0.5">{valor}</p>
      {nota && <p className="text-[11px] text-gray-400 mt-0.5">{nota}</p>}
    </div>
  )
}

export default async function MisionNavidadPage() {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin' && sesion.rol !== 'asesor') redirect('/dashboard')
  const esAdminVista = sesion.rol === 'admin'

  const {
    ranking, deAdmins, totalAdmins, total, deOctubre, credito, porFacturar, porFacturarN,
    pct, totalDias, transcurridos, pctTiempo, ritmoDiario, proyeccion, falta,
  } = await calcularMisionNavidad()

  // Lo mío (solo asesoras): posición en el ranking y cuánto falta para alcanzar a la de arriba.
  const miPuesto = ranking.findIndex(f => f.id === sesion.id)
  const mia = miPuesto >= 0 ? ranking[miPuesto] : null
  const deArriba = miPuesto > 0 ? ranking[miPuesto - 1] : null

  return (
    <div className="p-4 md:p-6 max-w-[1000px] mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Misión Navidad · Bucaramanga</h1>
        <p className="text-sm text-gray-500">
          Meta del equipo: {formatCOP(META)} del 1 de noviembre al 31 de diciembre. Solo cuenta lo facturado (entregado)
          y ya pagado: lo que se entregó y aún se debe es crédito y no cuenta hasta que se pague.
          {esAdminVista && ' Las ventas de los administradores suman a la meta. Solo lee: no cambia ningún dato.'}
        </p>
      </div>

      {!esAdminVista && (
        <Card>
          <CardHeader><h2 className="text-sm font-semibold text-gray-900">Tu avance</h2></CardHeader>
          <CardContent>
            {mia ? (
              <>
                <div className="flex items-end justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-xs text-gray-500">Lo que ya cuenta (facturado y pagado)</p>
                    <p className="text-3xl font-bold text-gray-900">{formatCOP(mia.valor)}</p>
                  </div>
                  <p className="text-sm text-gray-600">
                    Vas en el puesto <b>{miPuesto + 1}</b> de {ranking.length}
                    {deArriba && <> · te faltan <b>{formatCOP(Math.max(deArriba.valor - mia.valor, 0))}</b> para alcanzar a {deArriba.asesor}</>}
                    {!deArriba && ranking.length > 1 && <> · ¡vas de primera!</>}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <Kpi titulo="A crédito (aún no cuenta)" valor={formatCOP(mia.credito)} nota="Entregado y aún debido; cuenta cuando te lo paguen" />
                  <Kpi titulo="Por entregar y facturar" valor={formatCOP(mia.porFacturar)} nota={`${mia.porFacturarN} pedidos de noviembre sin entregar`} />
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-600">
                Tu cuenta no participa en el ranking de la Misión Navidad.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <p className="text-xs text-gray-500">Meta del equipo: facturado y pagado hasta hoy</p>
              <p className="text-3xl font-bold text-gray-900">{formatCOP(total)}</p>
            </div>
            <p className="text-sm text-gray-600"><b>{pct.toFixed(1)}%</b> de la meta · pasó el {pctTiempo.toFixed(1)}% del tiempo</p>
          </div>
          <div className="relative mt-3 h-3 rounded-full bg-gray-100 overflow-hidden">
            <div className="absolute inset-y-0 left-0 bg-blue-600 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
            <div className="absolute inset-y-0 w-0.5 bg-gray-800" style={{ left: `${Math.min(pctTiempo, 100)}%` }} title="Dónde debería ir según el tiempo" />
          </div>
          <p className="text-[11px] text-gray-400 mt-1">La raya negra marca dónde debería ir según los días que han pasado.</p>
        </CardContent>
      </Card>

      <div className={`grid grid-cols-2 gap-3 ${esAdminVista ? 'lg:grid-cols-5' : 'lg:grid-cols-3'}`}>
        {esAdminVista && <Kpi titulo="A crédito (no cuenta)" valor={formatCOP(credito)} nota="Entregado y aún debido; cuenta cuando se pague" />}
        <Kpi titulo="Falta para la meta" valor={formatCOP(falta)} nota={`${totalDias - transcurridos} días restantes`} />
        <Kpi titulo="Ritmo diario" valor={formatCOP(ritmoDiario)} nota={`Día ${transcurridos} de ${totalDias}`} />
        <Kpi titulo="Proyección al 31-dic" valor={formatCOP(proyeccion)} nota="Si se mantiene este ritmo" />
        {esAdminVista && <Kpi titulo="Por facturar" valor={formatCOP(porFacturar)} nota={`${porFacturarN} pedidos de noviembre sin entregar`} />}
      </div>

      <Card>
        <CardHeader><h2 className="text-sm font-semibold text-gray-900">Ranking de asesoras (viaje internacional)</h2></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase text-left">#</th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase text-left">Asesora</th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase text-right">Cuenta (pagado)</th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase text-left">Sede</th>
                  {esAdminVista && <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase text-right">A crédito</th>}
                  {esAdminVista && <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase text-right">Por facturar</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {ranking.map((f, i) => (
                  <tr key={`${f.sede}-${f.asesor}`} className={f.id === sesion.id ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                    <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-4 py-2 text-gray-800 font-medium">{f.asesor}{f.id === sesion.id && <span className="ml-1 text-[11px] text-blue-600">(tú)</span>}</td>
                    <td className="px-4 py-2 text-right font-semibold text-gray-900">{formatCOP(f.valor)}</td>
                    <td className="px-4 py-2 text-gray-600">{f.sede}</td>
                    {esAdminVista && <td className="px-4 py-2 text-right text-amber-700">{formatCOP(f.credito)}</td>}
                    {esAdminVista && <td className="px-4 py-2 text-right text-gray-500">{formatCOP(f.porFacturar)} <span className="text-[11px] text-gray-400">({f.porFacturarN})</span></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {esAdminVista && totalAdmins > 0 && (
        <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3">
          La meta incluye {formatCOP(totalAdmins)} vendidos por administradores ({deAdmins.filter(f => f.valor > 0).map(f => f.asesor).join(', ')}).
          No entran al ranking del viaje.
        </p>
      )}
      {esAdminVista && deOctubre > 0 && (
        <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3">
          De lo que cuenta, {formatCOP(deOctubre)} son pedidos creados en octubre que se facturaron desde el 1 de noviembre.
        </p>
      )}
      <p className="text-[11px] text-gray-400">
        El ranking del viaje incluye a Luisa (Santa Rosa); la meta de {formatCOP(META)} cuenta solo Bucaramanga.
        Valor de cada venta = valor del pedido (no el total de la factura, que queda en $0 cuando el cliente ya había pagado).
        No cuentan pedidos cancelados ni facturas anuladas.
      </p>
    </div>
  )
}
