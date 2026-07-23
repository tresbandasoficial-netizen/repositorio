import Link from 'next/link'
import { BotonVolver } from '@/components/ui/BotonVolver'
import { notFound } from 'next/navigation'
import { getFacturaRecibo } from '@/lib/queries/facturas'
import { ReciboFacturaView } from '@/components/facturacion/ReciboFacturaView'

export default async function ReciboPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getFacturaRecibo(id)
  if (!data) notFound()

  return (
    <div className="p-4 max-w-md mx-auto">
      <BotonVolver href={`/facturacion/${id}`}>Volver a la factura</BotonVolver>
      <div className="mt-3">
        <ReciboFacturaView data={data} />
      </div>
    </div>
  )
}
