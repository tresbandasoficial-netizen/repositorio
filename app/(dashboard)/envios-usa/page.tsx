import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'
import { EnviosUsaPanel } from '@/components/envios-usa/EnviosUsaPanel'

// Envíos internacionales (USA) — solo admin. La cuenta Davivienda es de la
// transportadora: su saldo = lo que TB tiene a favor con ellos. Aquí se
// registran los cobros de cada caja y se ve la plata que entra (pagos de
// clientes y consignaciones de las sedes — la asesora solo ve "consignar a
// Davivienda", el contexto de envíos vive únicamente en esta página).
export default async function EnviosUsaPage() {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') notFound()

  const supabase = await createClient()

  const { data: cuenta } = await supabase
    .from('cuentas').select('id').eq('metodo_pago', 'davivienda').maybeSingle()
  const cuentaId = cuenta?.id ?? null

  const [{ data: saldoRow }, { data: envios }, pagosRes, pagosFacRes, trasladosRes] = await Promise.all([
    supabase.from('saldos_cuentas').select('saldo_neto').eq('id', cuentaId ?? '').maybeSingle(),
    supabase.from('envios_usa').select('id, fecha, descripcion, valor, creado_en').order('fecha', { ascending: false }).order('creado_en', { ascending: false }).limit(100),
    supabase.from('pagos').select('fecha, monto').eq('cuenta_id', cuentaId ?? '').eq('anulado', false).order('fecha', { ascending: false }).limit(15),
    supabase.from('pagos_factura').select('fecha, monto').eq('cuenta_id', cuentaId ?? '').eq('anulado', false).order('fecha', { ascending: false }).limit(15),
    supabase.from('traslados_caja').select('fecha, monto, notas, origen:cuentas!traslados_caja_origen_cuenta_id_fkey(nombre)').eq('destino_cuenta_id', cuentaId ?? '').order('fecha', { ascending: false }).limit(15),
  ])

  // Plata que ha entrado a la cuenta (les queda a favor): pagos de clientes y
  // consignaciones/traslados desde las sedes.
  const ingresos = [
    ...((pagosRes.data ?? []) as any[]).map(p => ({ fecha: p.fecha as string, detalle: 'Pago de cliente', monto: p.monto as number })),
    ...((pagosFacRes.data ?? []) as any[]).map(p => ({ fecha: p.fecha as string, detalle: 'Abono de factura', monto: p.monto as number })),
    ...((trasladosRes.data ?? []) as any[]).map(t => {
      const origen = Array.isArray(t.origen) ? t.origen[0] : t.origen
      return { fecha: t.fecha as string, detalle: [origen?.nombre ? `Consignación desde ${origen.nombre}` : 'Ingreso', t.notas].filter(Boolean).join(' · '), monto: t.monto as number }
    }),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 20)

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Envíos USA</h1>
      <p className="text-sm text-gray-500 mb-5">
        Cuadre con la transportadora: lo que entra a la cuenta Davivienda queda a tu favor,
        y aquí registras lo que te cobran por cada envío.
      </p>
      <EnviosUsaPanel
        saldo={saldoRow?.saldo_neto ?? 0}
        envios={(envios ?? []) as Array<{ id: string; fecha: string; descripcion: string; valor: number }>}
        ingresos={ingresos}
      />
    </div>
  )
}
