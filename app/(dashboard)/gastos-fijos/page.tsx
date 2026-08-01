import { redirect } from 'next/navigation'
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

export default async function GastosFijosPage() {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') redirect('/dashboard')

  const supabase = await createClient()
  const hoy = hoyBogota()                     // YYYY-MM-DD en Bogotá
  const inicioMes = hoy.slice(0, 8) + '01'

  // Margen REAL: utilidad/venta de los pedidos con costo conocido en los
  // últimos 90 días (en julio dio ~33%). Si no hay datos, usa el de respaldo.
  const hace90 = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString()

  const [gastosRes, pedidosRes, variablesRes, margenRes] = await Promise.all([
    supabase.from('gastos_fijos').select('id, concepto, monto, activo').order('monto', { ascending: false }),
    // Ventas del mes actual (todas las sedes), convención: sin cancelados ni saldo_anterior
    supabase
      .from('pedidos')
      .select('total')
      .gte('fecha_creacion', `${inicioMes}T00:00:00-05:00`)
      .neq('estado', 'cancelado')
      .neq('tipo', 'saldo_anterior'),
    // Gastos variables del mes en /gastos, sin lo que duplicaría los fijos ni mercancía
    supabase
      .from('gastos')
      .select('valor, categoria')
      .gte('fecha', inicioMes),
    supabase
      .from('vista_ganancia_pedidos')
      .select('venta, utilidad')
      .eq('tiene_costo', true)
      .neq('estado', 'cancelado')
      .gte('fecha_creacion', hace90)
      .limit(2000),
  ])

  const gastos = (gastosRes.data ?? []) as { id: string; concepto: string; monto: number; activo: boolean }[]
  const totalFijos = gastos.filter(g => g.activo).reduce((s, g) => s + g.monto, 0)
  const ventasMes = (pedidosRes.data ?? []).reduce((s, p) => s + (p.total ?? 0), 0)
  const gastosVariablesMes = (variablesRes.data ?? [])
    .filter(g => !CATEGORIAS_EXCLUIDAS.includes(g.categoria ?? ''))
    .reduce((s, g) => s + (g.valor ?? 0), 0)

  const ventaConCosto = (margenRes.data ?? []).reduce((s, p) => s + (p.venta ?? 0), 0)
  const utilidadConCosto = (margenRes.data ?? []).reduce((s, p) => s + (p.utilidad ?? 0), 0)
  const margenBruto = ventaConCosto > 0 ? utilidadConCosto / ventaConCosto : MARGEN_RESPALDO

  // Punto de equilibrio: cuánto hay que VENDER para que el margen cubra los fijos
  const puntoEquilibrio = Math.ceil(totalFijos / margenBruto)

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Gastos fijos y punto de equilibrio</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Solo administradores. Margen bruto: {(margenBruto * 100).toFixed(1)}%
          {ventaConCosto > 0
            ? ` (real, calculado de ${formatCOP(ventaConCosto)} vendidos con costo conocido en los últimos 90 días)`
            : ' (teórico de respaldo — no hay costos registrados recientes)'}.
          Mes en curso desde el {inicioMes}.
        </p>
      </div>

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
      />

      <p className="text-xs text-gray-400">
        Punto de equilibrio = gastos fijos ÷ margen. Vendiendo {formatCOP(puntoEquilibrio)} al mes,
        la utilidad bruta (~{(margenBruto * 100).toFixed(1)}%) paga exactamente los fijos; de ahí en
        adelante todo es ganancia. Los gastos variables salen de /gastos SIN nómina, arriendo,
        servicios (ya están en los fijos) ni compras de mercancía (van dentro del costo).
      </p>
    </div>
  )
}
