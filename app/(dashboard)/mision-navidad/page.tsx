import { redirect } from 'next/navigation'
import { getSesion } from '@/lib/auth/acceso'
import { createAdminClient } from '@/lib/supabase/admin'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { formatCOP, hoyBogota } from '@/lib/utils/format'

// Misión Navidad — Bucaramanga (TR). Meta de equipo: $650M del 1-nov al 31-dic-2026.
// Reglas del dueño (10-nov): SOLO cuenta lo facturado (la factura sale cuando se entrega)
// desde el 1-nov Y PAGADO: el crédito (entregado que aún se debe) NO cuenta. Las ventas de los
// administradores suman a la meta; la cuenta jhon fredy no.
// Solo LEE: la cuenta la hace la función SQL mision_navidad (migración 217).
const SEDE = 'TR'
const META = 650_000_000
const DESDE = '2026-11-01'
const HASTA = '2026-12-31'
// Luisa (Santa Rosa) entra al ranking del VIAJE (10-nov), pero sus ventas no suman a la
// meta de $650M, que es solo de Bucaramanga.
const LUISA_SR_ID = '35aea4c1-4974-492d-b86e-2ddb345165f1'
// Ventas que NO suman a nada: la cuenta de asesora "jhon fredy" (decisión del dueño, 10-nov).
// Las ventas de los ADMINISTRADORES (Johan, Ronaldo) sí suman a la meta del equipo, pero no
// participan en el ranking del viaje (es para la asesora que más venda).
const EXCLUIDOS = [
  '5aa07286-5ada-4e4b-a4b3-ef020068e229', // jhon fredy
]

type Fila = {
  asesor_id: string | null; asesor: string
  facturado_n: number; facturado_total: string | number
  facturado_bruto: string | number; credito: string | number
  facturado_de_antes: string | number
  por_facturar_n: number; por_facturar: string | number
}

const dias = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)

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
  if (sesion.rol !== 'admin') redirect('/dashboard')

  // Se cuenta por FECHA DE FACTURA: los pedidos creados en octubre que se facturan
  // desde el 1-nov SÍ entran (decisión del dueño, 10-nov).

  const admin = createAdminClient()
  const { data, error } = await (admin as any).rpc('mision_navidad', {
    p_sede: SEDE, p_desde: DESDE, p_hasta: HASTA, p_excluir: EXCLUIDOS,
  })
  if (error) throw new Error(`Misión Navidad: no se pudo calcular el avance (${error.message})`)

  // Administradores: suman a la meta del equipo pero no entran al ranking del viaje.
  const { data: admins } = await admin.from('usuarios').select('id').eq('rol', 'admin')
  const idsAdmin = new Set(((admins ?? []) as Array<{ id: string }>).map(a => a.id))

  const aFila = (f: Fila, sede: string) => ({
    esAdmin: !!f.asesor_id && idsAdmin.has(f.asesor_id),
    asesor: f.asesor,
    sede,
    n: Number(f.facturado_n),
    valor: Number(f.facturado_total),   // lo PAGADO de lo facturado: lo que cuenta
    credito: Number(f.credito),         // entregado y aún debido: NO cuenta
    deOctubre: Number(f.facturado_de_antes),
    porFacturar: Number(f.por_facturar),
    porFacturarN: Number(f.por_facturar_n),
  })
  const filas = ((data ?? []) as Fila[]).map(f => aFila(f, 'Bucaramanga')).sort((a, b) => b.valor - a.valor)

  // Ranking del viaje = asesoras de Bucaramanga + Luisa de Santa Rosa.
  const { data: dataSR, error: errorSR } = await (admin as any).rpc('mision_navidad', {
    p_sede: 'SR', p_desde: DESDE, p_hasta: HASTA, p_excluir: [],
  })
  if (errorSR) throw new Error(`Misión Navidad: no se pudo calcular lo de Luisa (${errorSR.message})`)
  const luisa = ((dataSR ?? []) as Fila[]).find(f => f.asesor_id === LUISA_SR_ID)
  const ranking = [...filas.filter(f => !f.esAdmin), ...(luisa ? [aFila(luisa, 'Santa Rosa')] : [])].sort((a, b) => b.valor - a.valor)
  const deAdmins = filas.filter(f => f.esAdmin)
  const totalAdmins = deAdmins.reduce((s, f) => s + f.valor, 0)

  const total = filas.reduce((s, f) => s + f.valor, 0)
  const deOctubre = filas.reduce((s, f) => s + f.deOctubre, 0)
  const credito = filas.reduce((s, f) => s + f.credito, 0)
  const porFacturar = filas.reduce((s, f) => s + f.porFacturar, 0)
  const porFacturarN = filas.reduce((s, f) => s + f.porFacturarN, 0)
  const pct = (total / META) * 100

  const hoy = hoyBogota()
  const transcurridos = Math.min(Math.max(dias(DESDE, hoy) + 1, 1), dias(DESDE, HASTA) + 1)
  const totalDias = dias(DESDE, HASTA) + 1
  const pctTiempo = (transcurridos / totalDias) * 100
  const ritmoDiario = total / transcurridos
  const proyeccion = ritmoDiario * totalDias
  const falta = Math.max(META - total, 0)

  return (
    <div className="p-4 md:p-6 max-w-[1000px] mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Misión Navidad · Bucaramanga</h1>
        <p className="text-sm text-gray-500">
          Meta del equipo: {formatCOP(META)} del 1 de noviembre al 31 de diciembre. Solo cuenta lo facturado (entregado)
          y ya pagado: lo que se entregó y aún se debe es crédito y no cuenta hasta que se pague.
          Las ventas de los administradores suman a la meta. Solo lee: no cambia ningún dato.
        </p>
      </div>

      <Card>
        <CardContent>
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <p className="text-xs text-gray-500">Facturado y pagado hasta hoy</p>
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

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi titulo="A crédito (no cuenta)" valor={formatCOP(credito)} nota="Entregado y aún debido; cuenta cuando se pague" />
        <Kpi titulo="Falta para la meta" valor={formatCOP(falta)} nota={`${totalDias - transcurridos} días restantes`} />
        <Kpi titulo="Ritmo diario" valor={formatCOP(ritmoDiario)} nota={`Día ${transcurridos} de ${totalDias}`} />
        <Kpi titulo="Proyección al 31-dic" valor={formatCOP(proyeccion)} nota="Si se mantiene este ritmo" />
        <Kpi titulo="Por facturar" valor={formatCOP(porFacturar)} nota={`${porFacturarN} pedidos de noviembre sin entregar`} />
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
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase text-right">A crédito</th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase text-right">Por facturar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {ranking.map((f, i) => (
                  <tr key={`${f.sede}-${f.asesor}`} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-4 py-2 text-gray-800 font-medium">{f.asesor}</td>
                    <td className="px-4 py-2 text-right font-semibold text-gray-900">{formatCOP(f.valor)}</td>
                    <td className="px-4 py-2 text-gray-600">{f.sede}</td>
                    <td className="px-4 py-2 text-right text-amber-700">{formatCOP(f.credito)}</td>
                    <td className="px-4 py-2 text-right text-gray-500">{formatCOP(f.porFacturar)} <span className="text-[11px] text-gray-400">({f.porFacturarN})</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {totalAdmins > 0 && (
        <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3">
          La meta incluye {formatCOP(totalAdmins)} vendidos por administradores ({deAdmins.filter(f => f.valor > 0).map(f => f.asesor).join(', ')}).
          No entran al ranking del viaje.
        </p>
      )}
      {deOctubre > 0 && (
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
