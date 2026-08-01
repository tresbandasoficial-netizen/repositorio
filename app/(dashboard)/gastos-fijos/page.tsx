import { redirect } from 'next/navigation'
import { getSesion } from '@/lib/auth/acceso'
import { createClient } from '@/lib/supabase/server'
import { formatCOP, hoyBogota } from '@/lib/utils/format'
import { GastosFijosPanel } from '@/components/gastos-fijos/GastosFijosPanel'

// Margen bruto del negocio según la regla de costos: ALO cuesta el 80% del
// precio de venta, Adidas/Nike el 75%. Con el mix real de ventas queda ~22%.
const MARGEN_BRUTO = 0.22

// Días de trabajo al mes acordados para las cuentas por día.
const DIAS_MES = 27

export default async function GastosFijosPage() {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') redirect('/dashboard')

  const supabase = await createClient()
  const hoy = hoyBogota()                     // YYYY-MM-DD en Bogotá
  const inicioMes = hoy.slice(0, 8) + '01'

  const [gastosRes, pedidosRes, variablesRes] = await Promise.all([
    supabase.from('gastos_fijos').select('id, concepto, monto, activo').order('monto', { ascending: false }),
    // Ventas del mes actual (todas las sedes), convención: sin cancelados ni saldo_anterior
    supabase
      .from('pedidos')
      .select('total')
      .gte('fecha_creacion', `${inicioMes}T00:00:00-05:00`)
      .neq('estado', 'cancelado')
      .neq('tipo', 'saldo_anterior'),
    // Gastos variables ya registrados este mes en /gastos
    supabase.from('gastos').select('valor').gte('fecha', inicioMes),
  ])

  const gastos = (gastosRes.data ?? []) as { id: string; concepto: string; monto: number; activo: boolean }[]
  const totalFijos = gastos.filter(g => g.activo).reduce((s, g) => s + g.monto, 0)
  const ventasMes = (pedidosRes.data ?? []).reduce((s, p) => s + (p.total ?? 0), 0)
  const gastosVariablesMes = (variablesRes.data ?? []).reduce((s, g) => s + (g.valor ?? 0), 0)

  // Punto de equilibrio: cuánto hay que VENDER para que el margen cubra los fijos
  const puntoEquilibrio = Math.ceil(totalFijos / MARGEN_BRUTO)

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Gastos fijos y punto de equilibrio</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Solo administradores. Margen bruto usado: {(MARGEN_BRUTO * 100).toFixed(0)}% (ALO 20% ·
          Adidas/Nike 25%, ponderado con el mix real). Mes en curso desde el {inicioMes}.
        </p>
      </div>

      <GastosFijosPanel
        gastos={gastos}
        totalFijos={totalFijos}
        puntoEquilibrio={puntoEquilibrio}
        ventasMes={ventasMes}
        gastosVariablesMes={gastosVariablesMes}
        diasMes={DIAS_MES}
      />

      <p className="text-xs text-gray-400">
        Punto de equilibrio = gastos fijos ÷ margen. Vendiendo {formatCOP(puntoEquilibrio)} al mes,
        la utilidad bruta (~{(MARGEN_BRUTO * 100).toFixed(0)}%) paga exactamente los fijos; de ahí en
        adelante todo es ganancia. Los gastos variables del mes salen de lo registrado en /gastos.
      </p>
    </div>
  )
}
