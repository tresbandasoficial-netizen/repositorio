import { createClient } from '@/lib/supabase/server'

// Descuadres de cartera: plata mal registrada que hace mentir la deuda de un
// cliente (pagos cobrados dos veces, facturas pagas que figuran pendientes,
// pagos que le bajan la deuda a quien no es). Lo normal es lista vacía.
// La lógica vive en la vista `vista_descuadres_cartera` (migración 168).

export type DescuadreCartera = {
  tipo: string
  descripcion: string
  cliente_id: string | null
  cliente: string | null
  referencia: string | null
  detalle: string | null
  monto: number
}

export async function getDescuadresCartera(): Promise<DescuadreCartera[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vista_descuadres_cartera')
    .select('tipo, descripcion, cliente_id, cliente, referencia, detalle, monto')
    .order('monto', { ascending: false })
    .limit(50)

  // Un fallo del centinela no puede tumbar la cartera: se reporta vacío.
  if (error) return []
  return (data ?? []) as DescuadreCartera[]
}
