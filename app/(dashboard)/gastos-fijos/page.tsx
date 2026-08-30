import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSesion } from '@/lib/auth/acceso'
import { createClient } from '@/lib/supabase/server'
import { formatCOP, hoyBogota } from '@/lib/utils/format'
import { GastosFijosPanel } from '@/components/gastos-fijos/GastosFijosPanel'

// Margen de respaldo si no hay costos registrados en los últimos 90 días.
// (Regla teórica: ALO cuesta 80% del precio de venta, Adidas/Nike 75% → ~22%.)
const MARGEN_RESPALDO = 0.22

// Días de trabajo al mes acordados para las cuentas por día.
const DIAS_MES = 27

// Categorías de /gastos que NO se suman como gasto variable aquí: nómina,
// arriendo y servicios ya están en los gastos fijos (se duplicarían), y las
// compras de mercancía son inversión en inventario (ya van dentro del costo
// que descuenta el margen).
const CATEGORIAS_EXCLUIDAS = ['nomina', 'arriendo', 'servicios', 'compras_mercancia']

export default async function GastosFijosPage({
  searchParams,
}: {
  searchParams: Promise<{ sede?: string }>
}) {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') redirect('/dashboard')

  const supabase = await createClient()
  const hoy = hoyBogota()                     // YYYY-MM-DD en Bogotá
  const inicioMes = hoy.slice(0, 8) + '01'

  const { data: sedesRaw } = await supabase.from('sedes').select('id, codigo, nombre').order('codigo')
  const sedes = (sedesRaw ?? []) as { id: string; codigo: string; nombre: string }[]

  // Pestaña activa: una sede (TR por defecto) o TODAS (el negocio completo)
  const sp = await searchParams
  const sedeParam = (sp.sede ?? 'TR').toUpperCase()
  const sedeSel = sedeParam === 'TODAS' ? null : (sedes.find(s => s.codigo === sedeParam) ?? sedes.find(s => s.codigo === 'TR') ?? null)
  const codigoSel = sedeSel?.codigo ?? 'TODAS'

  // Margen REAL: utilidad/venta de los pedidos con costo conocido en los
  // últimos 90 días, de ESTA sede (o de todas). Fallback al teórico.
  const hace90 = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString()

  let qGastos = supabase.from('gastos_fijos').select('id, concepto, monto, activo').order('monto', { ascending: false })
  if (sedeSel) qGastos = qGastos.eq('sede_id', sedeSel.id)

  let qPedidos = supabase
    .from('pedidos')
    .select('total')
    .gte('fecha_creacion', `${inicioMes}T00:00:00-05:00`)
    .neq('estado', 'cancelado')
    .neq('tipo', 'saldo_anterior')
  if (sedeSel) qPedidos = qPedidos.eq('sede_id', sedeSel.id)

  let qVariables = supabase.from('gastos').select('valor, categoria').gte('fecha', inicioMes)
  if (sedeSel) qVariables = qVariables.eq('sede_id', sedeSel.id)

  let qMargen = supabase
    .from('vista_ganancia_pedidos')
    .select('venta, utilidad')
    .eq('tiene_costo', true)
    .neq('estado', 'cancelado')
    .gte('fecha_creacion', hace90)
    .limit(2000)
  if (sedeSel) qMargen = qMargen.eq('sede_id', sedeSel.id)

  // Ganancia REAL del mes (pedido de Johan 29-ago): solo lo YA COBRADO —
  // pedidos ENTREGADOS y PAGADOS con costo de compra asignado (las ventas de
  // entrega inmediata VL nacen entregadas, así que entran solas). Lo entregado
  // sin pagar y lo que está en camino se muestran aparte.
  let qGananciaMes = supabase
    .from('vista_ganancia_pedidos')
    .select('pedido_id, numero_orden, venta, utilidad, tiene_costo, estado')
    .neq('estado', 'cancelado')
    .neq('tipo', 'saldo_anterior')
    .gte('fecha_creacion', `${inicioMes}T00:00:00-05:00`)
    .limit(3000)
  if (sedeSel) qGananciaMes = qGananciaMes.eq('sede_id', sedeSel.id)

  // Gastos fijos ya marcados como pagados este mes
  const qPagados = supabase.from('gastos_fijos_pagos').select('gasto_fijo_id').eq('mes', inicioMes)

  const [gastosRes, pedidosRes, variablesRes, margenRes, gananciaMesRes, pagadosRes] = await Promise.all([qGastos, qPedidos, qVariables, qMargen, qGananciaMes, qPagados])

  const gananciaMesRows = (gananciaMesRes.data ?? []) as Array<{ pedido_id: string; numero_orden: string; venta: number; utilidad: number; tiene_costo: boolean; estado: string }>

  // ¿Cuáles de esos pedidos ya están PAGADOS del todo? total_pagado (mig. 169:
  // incluye la parte que le toca de los abonos de su factura) vs total.
  // .in() por tandas: listas largas revientan la URL de PostgREST (regla ~300).
  const idsMes = gananciaMesRows.map(g => g.pedido_id)
  const pagadoDe = new Map<string, boolean>()
  for (let i = 0; i < idsMes.length; i += 200) {
    const { data: tanda } = await supabase
      .from('vista_pedidos_asesor')
      .select('id, total, total_pagado')
      .in('id', idsMes.slice(i, i + 200))
    for (const p of (tanda ?? []) as Array<{ id: string; total: number; total_pagado: number }>) {
      pagadoDe.set(p.id, (p.total_pagado ?? 0) >= (p.total ?? 0))
    }
  }

  const gastos = (gastosRes.data ?? []) as { id: string; concepto: string; monto: number; activo: boolean }[]
  const totalFijos = gastos.filter(g => g.activo).reduce((s, g) => s + g.monto, 0)
  const ventasMes = (pedidosRes.data ?? []).reduce((s, p) => s + (p.total ?? 0), 0)
  const gastosVariablesMes = (variablesRes.data ?? [])
    .filter(g => !CATEGORIAS_EXCLUIDAS.includes(g.categoria ?? ''))
    .reduce((s, g) => s + (g.valor ?? 0), 0)

  const ventaConCosto = (margenRes.data ?? []).reduce((s, p) => s + (p.venta ?? 0), 0)
  const utilidadConCosto = (margenRes.data ?? []).reduce((s, p) => s + (p.utilidad ?? 0), 0)
  const margenBruto = ventaConCosto > 0 ? utilidadConCosto / ventaConCosto : MARGEN_RESPALDO

  // Utilidad del mes: SOLO lo cobrado — entregado + pagado + con costo.
  // Lo entregado sin pagar y lo con costo aún en camino van aparte; lo sin
  // costo sigue en su aviso.
  const conCosto = gananciaMesRows.filter(g => g.tiene_costo)
  const aLista = (rows: typeof conCosto) => rows
    .sort((a, b) => (b.utilidad ?? 0) - (a.utilidad ?? 0))
    .slice(0, 80)
    .map(g => ({ numero: g.numero_orden, utilidad: g.utilidad ?? 0 }))
  const cobrados   = conCosto.filter(g => g.estado === 'entregado' && pagadoDe.get(g.pedido_id) === true)
  const porCobrar  = conCosto.filter(g => g.estado === 'entregado' && pagadoDe.get(g.pedido_id) !== true)
  const enCamino   = conCosto.filter(g => g.estado !== 'entregado')
  const utilidadRealMes     = cobrados.reduce((s, g) => s + (g.utilidad ?? 0), 0)
  const utilidadPorCobrarMes = porCobrar.reduce((s, g) => s + (g.utilidad ?? 0), 0)
  const utilidadEnCaminoMes  = enCamino.reduce((s, g) => s + (g.utilidad ?? 0), 0)
  const ventaSinCostoMes = gananciaMesRows.filter(g => !g.tiene_costo).reduce((s, g) => s + (g.venta ?? 0), 0)
  const utilidadEstimadaMes = 0

  // Punto de equilibrio: cuánto hay que VENDER para que el margen cubra los fijos
  const puntoEquilibrio = totalFijos > 0 ? Math.ceil(totalFijos / margenBruto) : 0

  const tabs = [
    ...sedes.map(s => ({ codigo: s.codigo, nombre: s.nombre })),
    { codigo: 'TODAS', nombre: 'Todo el negocio' },
  ]

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Punto de equilibrio</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Solo administradores · Margen bruto {codigoSel === 'TODAS' ? 'del negocio' : `de ${sedeSel?.nombre}`}:{' '}
            {(margenBruto * 100).toFixed(1)}%
            {ventaConCosto > 0
              ? ` (real, de ${formatCOP(ventaConCosto)} con costo conocido en 90 días)`
              : ' (teórico de respaldo)'}
          </p>
        </div>

        {/* Pestañas de sede, estilo píldoras del dashboard */}
        <div className="flex gap-1.5 bg-gray-100 rounded-2xl p-1">
          {tabs.map(t => (
            <Link
              key={t.codigo}
              href={`/gastos-fijos?sede=${t.codigo}`}
              className={`px-3.5 py-1.5 rounded-xl text-sm font-semibold transition-colors ${
                codigoSel === t.codigo
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {t.nombre}
            </Link>
          ))}
        </div>
      </div>

      {gastos.length === 0 && codigoSel !== 'TODAS' && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
          {sedeSel?.nombre} aún no tiene gastos fijos registrados — agrégalos abajo (arriendo, sueldos,
          servicios de esa sede) y el punto de equilibrio se calcula solo.
        </p>
      )}

      <GastosFijosPanel
        gastos={gastos}
        totalFijos={totalFijos}
        puntoEquilibrio={puntoEquilibrio}
        ventasMes={ventasMes}
        gastosVariablesMes={gastosVariablesMes}
        diasMes={DIAS_MES}
        margenBruto={margenBruto}
        diaDelMes={parseInt(hoy.slice(8, 10), 10)}
        diasCalendario={new Date(parseInt(hoy.slice(0, 4), 10), parseInt(hoy.slice(5, 7), 10), 0).getDate()}
        sedeId={sedeSel?.id ?? null}
        sedeNombre={codigoSel === 'TODAS' ? 'Todo el negocio' : sedeSel?.nombre ?? ''}
        utilidadRealMes={utilidadRealMes}
        utilidadEstimadaMes={utilidadEstimadaMes}
        ventaSinCostoMes={ventaSinCostoMes}
        pagadosIds={(pagadosRes.data ?? []).map(p => p.gasto_fijo_id as string)}
        mesActual={inicioMes}
        utilidadPorCobrarMes={utilidadPorCobrarMes}
        utilidadEnCaminoMes={utilidadEnCaminoMes}
        pedidosCobrados={aLista(cobrados)}
        pedidosPorCobrar={aLista(porCobrar)}
        pedidosEnCamino={aLista(enCamino)}
      />

      <p className="text-xs text-gray-400">
        Punto de equilibrio = gastos fijos ÷ margen. Los gastos variables salen de /gastos SIN nómina,
        arriendo, servicios (ya están en los fijos) ni compras de mercancía (van dentro del costo).
        En &quot;Todo el negocio&quot; se suman los gastos y ventas de todas las sedes.
      </p>
    </div>
  )
}
