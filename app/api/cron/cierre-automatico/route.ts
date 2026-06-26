import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hoyBogota } from '@/lib/utils/format'

// Cierre automático de caja a las 9:00 p.m. (hora Colombia).
// Para cada sede que NO cerró caja hoy, crea el cierre con el snapshot del día
// y lo marca como automático. A partir de ahí la sede queda bloqueada para los
// asesores (solo el admin puede registrar o reabrir).
//
// Protegido con CRON_SECRET. Agendado en vercel.json:
//   { "path": "/api/cron/cierre-automatico", "schedule": "0 2 * * *" }
// 02:00 UTC = 21:00 hora Bogotá (UTC-5).

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const supabase = createAdminClient()
  const hoy = hoyBogota()

  const { data: sedes, error: errSedes } = await supabase.from('sedes').select('id')
  if (errSedes) return NextResponse.json({ error: errSedes.message }, { status: 500 })
  if (!sedes || sedes.length === 0) return NextResponse.json({ cerradas: 0 })

  // Sedes que ya tienen cierre hoy (manual o automático): no se tocan.
  const { data: yaCerradasRaw } = await supabase
    .from('cierres_caja')
    .select('sede_id')
    .eq('fecha', hoy)
  const yaCerradas = new Set((yaCerradasRaw ?? []).map((c: { sede_id: string }) => c.sede_id))

  let creadas = 0
  for (const sede of sedes as Array<{ id: string }>) {
    if (yaCerradas.has(sede.id)) continue

    // Snapshot del flujo del día de la sede (mismas columnas que el cierre manual).
    const { data: flujo } = await supabase
      .from('flujo_caja_diario')
      .select('*')
      .eq('fecha', hoy)
      .eq('sede_id', sede.id)

    type FlujoRow = {
      cuenta_id: string
      cuenta_nombre: string
      tipo: string
      ingresos_hoy: number
      egresos_hoy: number
      neto_hoy: number
    }
    const detalle = ((flujo ?? []) as FlujoRow[])
      .filter(f => f.ingresos_hoy > 0 || f.egresos_hoy > 0)
      .map(f => ({
        cuenta_id:     f.cuenta_id,
        cuenta_nombre: f.cuenta_nombre,
        tipo:          f.tipo,
        ingresos:      f.ingresos_hoy,
        egresos:       f.egresos_hoy,
        neto:          f.neto_hoy,
      }))

    const total_ingresos = detalle.reduce((s, d) => s + d.ingresos, 0)
    const total_egresos  = detalle.reduce((s, d) => s + d.egresos, 0)

    const { error } = await supabase.from('cierres_caja').insert({
      fecha:           hoy,
      sede_id:         sede.id,
      usuario_id:      null,
      automatico:      true,
      notas:           'Cierre automático (9:00 p.m.)',
      detalle_cuentas: detalle,
      total_ingresos,
      total_egresos,
      neto:            total_ingresos - total_egresos,
    })

    // Si otra sesión cerró la caja entre la consulta y el insert, el UNIQUE
    // (sede_id, fecha) lo evita; ignoramos ese caso.
    if (!error) creadas++
  }

  return NextResponse.json({ cerradas: creadas })
}
