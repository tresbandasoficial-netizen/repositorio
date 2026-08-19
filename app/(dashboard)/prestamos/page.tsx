import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'
import { PrestamosPanel } from '@/components/prestamos/PrestamosPanel'

// Préstamos de terceros: deudas POR PAGAR del negocio (plata que alguien nos
// prestó). Solo admin — es información financiera privada.
export default async function PrestamosPage() {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') notFound()

  const supabase = await createClient()
  const [{ data: prestamos }, { data: abonos }, { data: cuentas }] = await Promise.all([
    supabase.from('prestamos_terceros')
      .select('id, acreedor, monto, fecha, notas, creado_en')
      .order('creado_en', { ascending: false }),
    supabase.from('abonos_prestamos')
      .select('id, prestamo_id, monto, fecha, notas, cuenta_id')
      .order('fecha', { ascending: true }),
    supabase.from('cuentas').select('id, nombre').order('nombre'),
  ])

  const nombreCuenta = new Map((cuentas ?? []).map((c: any) => [c.id, c.nombre]))
  const porPrestamo = new Map<string, any[]>()
  for (const a of abonos ?? []) {
    const arr = porPrestamo.get(a.prestamo_id) ?? []
    arr.push({ ...a, cuenta_nombre: a.cuenta_id ? nombreCuenta.get(a.cuenta_id) ?? null : null })
    porPrestamo.set(a.prestamo_id, arr)
  }

  const lista = (prestamos ?? []).map((p: any) => ({
    ...p,
    abonos: porPrestamo.get(p.id) ?? [],
  }))

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Préstamos</h1>
      <p className="text-sm text-gray-500 mb-5">
        Plata que le prestaron al negocio: a quién le debes, cuánto has abonado y cuánto falta.
      </p>
      <PrestamosPanel prestamos={lista} cuentas={(cuentas ?? []) as Array<{ id: string; nombre: string }>} />
    </div>
  )
}
