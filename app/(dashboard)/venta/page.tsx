import { redirect } from 'next/navigation'

// La venta rápida se unificó con la facturación: todo se vende/factura en un solo lugar.
export default function VentaPage() {
  redirect('/facturacion/nueva')
}
