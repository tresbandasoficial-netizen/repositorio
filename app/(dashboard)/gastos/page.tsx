import { redirect } from 'next/navigation'
import { getSesion } from '@/lib/auth/acceso'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGastosAction } from '@/app/actions/gastos'
import { formatCOP, hoyBogota } from '@/lib/utils/format'
import { CATEGORIA_GASTO_LABELS, CategoriaGasto, CATEGORIAS_GASTO, metodosDeSede } from '@/types'
import { GastosClientPage } from '@/components/gastos/GastosClientPage'

function hoy() { return hoyBogota() }
function inicioMes() { return hoyBogota().slice(0, 8) + '01' }

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

  // Para consignaciones entre sedes: el destino puede ser CUALQUIER cuenta
  // activa (ej: la asesora de Santa Rosa consigna a una cuenta de Bucaramanga).
  const cuentasDestino = cuentas.map(c => ({ id: c.id, nombre: c.nombre }))
  // Origen por defecto: la caja de efectivo de la sede del usuario.
  const origenDefault = cuentas.find(c => c.metodo_pago === 'efectivo' && c.sede_id === (sesion.sede_id ?? ''))?.id ?? ''

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

  // Cuenta entre sedes (mig. 186, solo admin): plata de una sede invertida en
  // pedidos de otra. Automática: cada compra dice de qué cuenta salió el
  // dinero (cuenta → sede; cuentas globales = TR, el hub de compras, igual
  // que _sincronizarGastoCompra) y el pedido dice para qué sede fue. Se usa
  // el cliente de servicio porque los costos de compra son solo de admin y
  // la página ya validó el rol.
  let entreSedes: { de: string; para: string; total: number; n: number }[] = []
  if (sesion.rol === 'admin') {
    const adminClient = createAdminClient()
    const { data: cruces } = await adminClient
      .from('compra_items')
      .select(`
        costo_unitario_cop, cantidad,
        pedido:pedidos!inner(sede_id),
        compra:compras!inner(cuenta_id, cuenta:cuentas(sede_id))
      `)
      .not('pedido_id', 'is', null)
      .limit(10000)

    const codigoDe = (id: string | null) => sedes.find(s => s.id === id)?.codigo ?? null
    const porDireccion = new Map<string, { de: string; para: string; total: number; n: number }>()
    for (const raw of (cruces ?? []) as any[]) {
      const pedido = Array.isArray(raw.pedido) ? raw.pedido[0] : raw.pedido
      const compra = Array.isArray(raw.compra) ? raw.compra[0] : raw.compra
      const cuenta = compra ? (Array.isArray(compra.cuenta) ? compra.cuenta[0] : compra.cuenta) : null
      if (!pedido || !compra?.cuenta_id) continue // sin cuenta no se sabe de dónde salió la plata
      const de = codigoDe(cuenta?.sede_id ?? null) ?? 'TR' // cuenta global → Bucaramanga
      const para = codigoDe(pedido.sede_id)
      if (!para || de === para) continue
      const clave = `${de}→${para}`
      const acc = porDireccion.get(clave) ?? { de, para, total: 0, n: 0 }
      acc.total += (raw.costo_unitario_cop ?? 0) * (raw.cantidad ?? 1)
      acc.n += raw.cantidad ?? 1
      porDireccion.set(clave, acc)
    }
    entreSedes = [...porDireccion.values()].sort((a, b) => b.total - a.total)
  }

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
      cuentasDestino={cuentasDestino}
      origenTrasladoId={origenDefault}
      entreSedes={entreSedes}
    />
  )
}
