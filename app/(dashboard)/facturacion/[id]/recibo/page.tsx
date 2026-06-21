import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getFacturaRecibo } from '@/lib/queries/facturas'
import { ReciboFacturaView } from '@/components/facturacion/ReciboFacturaView'

export default async function ReciboPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getFacturaRecibo(id)
  if (!data) notFound()

  return (
    <div className="p-4 max-w-md mx-auto">
      <Link href={`/facturacion/${id}`} className="text-sm text-gray-500 hover:text-gray-700">← Volver a la factura</Link>
      <div className="mt-3">
        <ReciboFacturaView data={data} />
      </div>
    </div>
  )
}
