import { NuevaFacturaForm } from '@/components/facturacion/NuevaFacturaForm'
import Link from 'next/link'

export default function NuevaFacturaPage() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Link href="/facturacion" className="text-sm text-gray-500 hover:text-gray-700">← Facturación</Link>
      <h1 className="text-xl font-bold text-gray-900 mt-3 mb-1">Nueva factura</h1>
      <p className="text-sm text-gray-500 mb-6">
        Selecciona un cliente y los pedidos entregados que quieres agrupar en una sola factura.
      </p>
      <NuevaFacturaForm />
    </div>
  )
}
