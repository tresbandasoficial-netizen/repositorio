import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hoyBogota } from '@/lib/utils/format'
import { DescuentosPanel, type DescuentoRow } from '@/components/descuentos/DescuentosPanel'

// Descuentos a empleados por errores — solo admin. El mes se elige con ?mes=YYYY-MM.
export default async function DescuentosPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase.from('usuarios').select('rol').eq('id', user.id).single()
  if (!usuario || usuario.rol !== 'admin') redirect('/dashboard')

  const { mes } = await searchParams
  const mesSel = /^\d{4}-\d{2}$/.test(mes ?? '') ? (mes as string) : hoyBogota().slice(0, 7)
  const desde = `${mesSel}-01`
  const [anio, m] = mesSel.split('-').map(Number)
  const hasta = new Date(anio, m, 0).getDate()  // último día del mes

  // El listado usa el cliente admin (la lista de usuarios está restringida por
  // RLS para asesores); el acceso ya se validó arriba.
  const admin = createAdminClient()
  const [{ data: empleados }, { data: descuentos }] = await Promise.all([
    admin.from('usuarios').select('id, nombre').eq('activo', true).neq('rol', 'visor').order('nombre'),
    admin
      .from('descuentos_empleados')
      .select('id, usuario_id, fecha, motivo, valor, pedido_ref, anulado, usuarios!descuentos_empleados_usuario_id_fkey(nombre)')
      .gte('fecha', desde)
      .lte('fecha', `${mesSel}-${String(hasta).padStart(2, '0')}`)
      .order('fecha', { ascending: false })
      .order('creado_en', { ascending: false }),
  ])

  const filas: DescuentoRow[] = ((descuentos ?? []) as any[]).map(d => ({
    id: d.id,
    usuario_id: d.usuario_id,
    usuario_nombre: (Array.isArray(d.usuarios) ? d.usuarios[0] : d.usuarios)?.nombre ?? '—',
    fecha: d.fecha,
    motivo: d.motivo,
    valor: d.valor,
    pedido_ref: d.pedido_ref,
    anulado: d.anulado,
  }))

  // Navegación de meses
  const fechaSel = new Date(anio, m - 1, 15)
  const mesAnterior = new Date(anio, m - 2, 15)
  const mesSiguiente = new Date(anio, m, 15)
  const aClave = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  const label = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(fechaSel)

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Descuentos por errores</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Solo administradores · El total del mes se descuenta en la nómina de cada empleado
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/descuentos?mes=${aClave(mesAnterior)}`} className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50">←</Link>
          <span className="text-sm font-semibold text-gray-900 capitalize">{label}</span>
          <Link href={`/descuentos?mes=${aClave(mesSiguiente)}`} className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50">→</Link>
        </div>
      </div>

      <DescuentosPanel
        empleados={(empleados ?? []) as Array<{ id: string; nombre: string }>}
        descuentos={filas}
      />
    </div>
  )
}
