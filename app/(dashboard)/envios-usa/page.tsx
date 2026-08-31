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
    supabase.from('envios_usa').select('id, fecha, descripcion, valor, creado_en, cant_zapatos, cant_ropa, cant_accesorios').order('fecha', { ascending: false }).order('creado_en', { ascending: false }).limit(100),
    supabase.from('pagos').select('fecha, monto, creado_en, pedidos!inner(clientes(nombre))').eq('cuenta_id', cuentaId ?? '').eq('anulado', false).order('fecha', { ascending: false }).limit(60),
    supabase.from('pagos_factura').select('fecha, monto, creado_en, facturas!inner(clientes(nombre))').eq('cuenta_id', cuentaId ?? '').eq('anulado', false).order('fecha', { ascending: false }).limit(60),
    supabase.from('traslados_caja').select('fecha, monto, notas, origen:cuentas!traslados_caja_origen_cuenta_id_fkey(nombre)').eq('destino_cuenta_id', cuentaId ?? '').order('fecha', { ascending: false }).limit(15),
  ])

  // Plata que ha entrado a la cuenta (les queda a favor). Un abono repartido
  // entre varios pedidos/facturas se muestra como UN solo ingreso por el TOTAL:
  // la transportadora verifica la consignación completa, no el reparto interno.
  // Se agrupa por cliente + momento exacto del registro (las partes de un mismo
  // abono comparten el creado_en).
  const nombreDe = (rel: any) => {
    const padre = Array.isArray(rel) ? rel[0] : rel
    const cli = padre?.clientes
    return (Array.isArray(cli) ? cli[0] : cli)?.nombre ?? 'Cliente'
  }
  const grupos = new Map<string, { fecha: string; detalle: string; monto: number }>()
  for (const p of ((pagosRes.data ?? []) as any[])) {
    const cliente = nombreDe(p.pedidos)
    const clave = `${cliente}|${p.creado_en}`
    const g = grupos.get(clave)
    if (g) g.monto += p.monto
    else grupos.set(clave, { fecha: p.fecha, detalle: `Pago de ${cliente}`, monto: p.monto })
  }
  for (const p of ((pagosFacRes.data ?? []) as any[])) {
    const cliente = nombreDe(p.facturas)
    const clave = `${cliente}|${p.creado_en}`
    const g = grupos.get(clave)
    if (g) g.monto += p.monto
    else grupos.set(clave, { fecha: p.fecha, detalle: `Pago de ${cliente}`, monto: p.monto })
  }
  const ingresos = [
    ...grupos.values(),
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
        envios={(envios ?? []) as Array<{ id: string; fecha: string; descripcion: string; valor: number; cant_zapatos: number; cant_ropa: number; cant_accesorios: number }>}
        ingresos={ingresos}
      />
    </div>
  )
}
