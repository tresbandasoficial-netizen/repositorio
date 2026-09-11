import { redirect } from 'next/navigation'
import { getSesion } from '@/lib/auth/acceso'
import { createClient } from '@/lib/supabase/server'
import { PreciosDolarClientPage, type PrecioDolarRow } from '@/components/precios-dolar/PreciosDolarClientPage'

// Precios dólar (sección Equipo): los asesores consultan el precio en pesos de
// cada tipo de artículo; el admin actualiza la TRM y la lista de precios.
export default async function PreciosDolarPage() {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') redirect('/dashboard')

  const supabase = await createClient()
  const [preciosRes, trmRes] = await Promise.all([
    supabase
      .from('precios_dolar')
      .select('id, tipo_articulo, valor_usd')
      .order('tipo_articulo'),
    supabase
      .from('configuracion')
      .select('valor, actualizado_en')
      .eq('clave', 'trm_dolar')
      .maybeSingle(),
  ])

  const precios = ((preciosRes.data ?? []) as Array<{ id: string; tipo_articulo: string; valor_usd: number | string }>)
    .map<PrecioDolarRow>(p => ({
      id: p.id,
      tipo_articulo: p.tipo_articulo,
      valor_usd: Number(p.valor_usd),
    }))

  const trm = Number(trmRes.data?.valor ?? 0)
  const trmActualizadaEn = trmRes.data?.actualizado_en ?? null

  return (
    <PreciosDolarClientPage
      precios={precios}
      trm={trm}
      trmActualizadaEn={trmActualizadaEn}
      esAdmin={sesion.rol === 'admin'}
    />
  )
}
