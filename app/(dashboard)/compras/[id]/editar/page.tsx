import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { EditarCompraForm } from '@/components/compras/EditarCompraForm'

export default async function EditarCompraPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (!usuario || usuario.rol !== 'admin') redirect('/dashboard')

  const { id } = await params

  const [{ data: compra }, { data: cuentasRaw }] = await Promise.all([
    supabase
      .from('compras')
      .select('id, tipo, proveedor, fecha, numero_factura, total_usd, trm, total_cop, notas, cuenta_id')
      .eq('id', id)
      .single(),
    supabase
      .from('cuentas')
      .select('id, nombre')
      .eq('activa', true)
      .neq('tipo', 'credito')
      .order('orden'),
  ])

  if (!compra) notFound()

  const cuentas = (cuentasRaw ?? []) as Array<{ id: string; nombre: string }>

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href={`/compras/${id}`}
          className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50 transition-colors"
        >
          ← Volver
        </Link>
        <h1 className="text-lg font-bold text-gray-900">
          Editar compra — {(compra as any).proveedor}
        </h1>
      </div>

      <EditarCompraForm
        compraId={id}
        inicial={{
          tipo:            (compra as any).tipo,
          proveedor:       (compra as any).proveedor,
          fecha:           (compra as any).fecha,
          numero_factura:  (compra as any).numero_factura ?? '',
          total_usd:       (compra as any).total_usd ?? null,
          trm:             (compra as any).trm ?? null,
          total_cop:       (compra as any).total_cop,
          notas:           (compra as any).notas ?? '',
          cuenta_id:       (compra as any).cuenta_id ?? null,
        }}
        cuentas={cuentas}
      />
    </div>
  )
}
