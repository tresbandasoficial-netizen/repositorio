import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Redirige de un NÚMERO de factura a su detalle. Permite enlazar a una factura
// desde cualquier lugar donde solo se tiene el número (cuadre, mensajerías…)
// sin conocer su id: /facturacion/n/FAC-TR-2026-0077 → /facturacion/{id}
export default async function FacturaPorNumeroPage({
  params,
}: {
  params: Promise<{ numero: string }>
}) {
  const { numero } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('facturas')
    .select('id')
    .ilike('numero_factura', decodeURIComponent(numero).trim())
    .maybeSingle()

  if (!data) notFound()
  redirect(`/facturacion/${data.id}`)
}
