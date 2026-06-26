import { redirect } from 'next/navigation'
import { getSesion } from '@/lib/auth/acceso'
import { createClient } from '@/lib/supabase/server'
import { getGastosAction } from '@/app/actions/gastos'
import { formatCOP } from '@/lib/utils/format'
import { CATEGORIA_GASTO_LABELS, CategoriaGasto, CATEGORIAS_GASTO, metodosDeSede } from '@/types'
import { GastosClientPage } from '@/components/gastos/GastosClientPage'

function hoy() { return new Date().toISOString().slice(0, 10) }
function inicioMes() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export default async function GastosPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; categoria?: string; sede?: string }>
}) {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') redirect('/dashboard')

  const sp = await searchParams
  const desde     = sp.desde     || inicioMes()
  const hasta     = sp.hasta     || hoy()
  const categoria = (sp.categoria as CategoriaGasto) || undefined

  // Asesores solo ven su propia sede; admin puede filtrar por cualquiera.
  const sedeForzadaId = sesion.rol === 'asesor' ? sesion.sede_id : null
  const sede_id = sedeForzadaId ?? sp.sede ?? undefined

  const supabase = await createClient()

  const [gastos, sedesRes, cuentasRes] = await Promise.all([
    getGastosAction({ desde, hasta, categoria, sede_id }),
    supabase.from('sedes').select('id, codigo, nombre').order('codigo'),
    supabase.from('cuentas').select('id, nombre, tipo, sede_id, metodo_pago, orden').eq('activa', true).neq('tipo', 'credito').order('orden'),
  ])

  const sedes = (sedesRes.data ?? []) as { id: string; codigo: string; nombre: string }[]
  let cuentas = (cuentasRes.data ?? []) as { id: string; nombre: string; tipo: string; sede_id: string | null; metodo_pago: string | null; orden: number }[]

  // Asesor: las cuentas de los métodos permitidos de su sede (efectivo = su caja;
  // Nequi/Addi/etc. son globales). Admin: todas.
  if (sedeForzadaId) {
    const codigo = sedes.find(s => s.id === sedeForzadaId)?.codigo
    const permitidos = new Set<string>(metodosDeSede(codigo))
    cuentas = cuentas.filter(c =>
      !!c.metodo_pago && permitidos.has(c.metodo_pago) &&
      (c.metodo_pago !== 'efectivo' || c.sede_id === sedeForzadaId)
    )
  }

  const sedeRestringida = sedeForzadaId ? (sedes.find(s => s.id === sedeForzadaId) ?? null) : null

  const totalGeneral = gastos.reduce((s, g) => s + g.valor, 0)
  const porCategoria = CATEGORIAS_GASTO.map(cat => ({
    categoria: cat,
    label: CATEGORIA_GASTO_LABELS[cat],
    total: gastos.filter(g => g.categoria === cat).reduce((s, g) => s + g.valor, 0),
  })).filter(c => c.total > 0).sort((a, b) => b.total - a.total)

  return (
    <GastosClientPage
      gastos={gastos}
      cuentas={cuentas}
      sedes={sedes}
      sedeRestringida={sedeRestringida}
      esAdmin={sesion.rol === 'admin'}
      porCategoria={porCategoria}
      totalGeneral={totalGeneral}
      filtros={{ desde, hasta, categoria, sede_id }}
    />
  )
}
