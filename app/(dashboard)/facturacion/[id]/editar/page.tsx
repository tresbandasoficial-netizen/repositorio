import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getFacturaDetalle } from '@/lib/queries/facturas'
import { getSesion } from '@/lib/auth/acceso'
import { createClient } from '@/lib/supabase/server'
import { EditarFacturaForm } from '@/components/facturacion/EditarFacturaForm'

export default async function EditarFacturaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') redirect(`/facturacion/${id}`)

  const factura = await getFacturaDetalle(id)
  if (!factura) notFound()
  if (factura.estado === 'anulada') redirect(`/facturacion/${id}`)

  // envío y descuento no vienen en la vista; se leen directo de la tabla.
  const supabase = await createClient()
  const { data: extra } = await supabase
    .from('facturas')
    .select('envio, descuento')
    .eq('id', id)
    .maybeSingle()

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link href={`/facturacion/${id}`} className="text-sm text-gray-500 hover:text-gray-700">← Volver a la factura</Link>
      <h1 className="text-xl font-bold text-gray-900 mt-3 mb-1">Editar factura</h1>
      <p className="text-sm text-gray-500 font-mono mb-6">{factura.numero_factura}</p>

      <EditarFacturaForm
        factura={{
          id: factura.id,
          cliente_id: factura.cliente_id,
          fecha_vencimiento: factura.fecha_vencimiento,
          notas: factura.notas ?? '',
          envio: (extra as any)?.envio ?? 0,
          descuento: (extra as any)?.descuento ?? 0,
          cliente_nombre: factura.cliente_nombre,
          total: factura.total,
          total_abonado: factura.total_abonado,
          saldo: factura.saldo,
        }}
        abonos={factura.abonos}
        pedidos={factura.pedidos}
        sedeCodigo={factura.sede_codigo}
      />
    </div>
  )
}
