import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hoyBogota } from '@/lib/utils/format'
import { getCuadreDia } from '@/lib/queries/domicilios'

// Cierre automático de caja a las 12:00 a.m. (medianoche, hora Colombia).
// Para cada sede que NO cerró caja ese día, crea el cierre con el snapshot del día que
// TERMINA (a medianoche ya es el día siguiente, por eso se cierra "ayer").
// Se marca como automático por su nota ("Cierre automático") y se atribuye a un
// usuario admin existente (la tabla exige usuario_id). A partir de ahí la sede
// queda bloqueada para los asesores (solo el admin puede registrar o reabrir).
//
// Protegido con CRON_SECRET. Agendado en vercel.json:
//   { "path": "/api/cron/cierre-automatico", "schedule": "0 5 * * *" }
// 05:00 UTC = 00:00 hora Bogotá (UTC-5). Vercel puede disparar el cron unos minutos después de
// la hora exacta, así que el día a cerrar NO depende de la hora de ejecución: si en Bogotá es
// antes del mediodía se cierra el día anterior; si no, el de hoy.
// (Cambio del dueño, 21-nov-2026: antes cerraba a las 9:00 p.m.)

const NOTA_AUTOMATICO = 'Cierre automático (12:00 a.m.)'

// Día (YYYY-MM-DD, Bogotá) que corresponde cerrar en este momento.
function diaACerrar(): string {
  const hoy = hoyBogota()
  const hora = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', hour: 'numeric', hourCycle: 'h23' }).format(new Date()))
  if (hora >= 12) return hoy
  return new Date(Date.parse(`${hoy}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  // CRON_SECRET es obligatorio: si no está configurado, la ruta queda cerrada.
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const hoy = diaACerrar()   // el día que termina (ver arriba), no necesariamente "hoy"

  const { data: sedes, error: errSedes } = await supabase.from('sedes').select('id')
  if (errSedes) return NextResponse.json({ error: errSedes.message }, { status: 500 })
  if (!sedes || sedes.length === 0) return NextResponse.json({ cerradas: 0 })

  // La tabla cierres_caja exige usuario_id; el cierre automático se atribuye a
  // un admin existente (queda claro que es automático por la nota).
  const { data: admin } = await supabase
    .from('usuarios')
    .select('id')
    .eq('rol', 'admin')
    .limit(1)
    .maybeSingle()
  if (!admin) return NextResponse.json({ error: 'No hay usuario admin para atribuir el cierre' }, { status: 500 })

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
      usuario_id:      admin.id,
      notas:           NOTA_AUTOMATICO,
      detalle_cuentas: detalle,
      total_ingresos,
      total_egresos,
      neto:            total_ingresos - total_egresos,
    })

    // Si otra sesión cerró la caja entre la consulta y el insert, el UNIQUE
    // (sede_id, fecha) lo evita; ignoramos ese caso.
    if (!error) creadas++
  }

  // ── Cierre automático del cuadre de DOMICILIOS del día (uno por día) ────────
  // Solo si hubo domicilios y no está ya cerrado. Así queda el registro diario
  // aunque nadie lo cierre manualmente.
  let domiciliosCerrados = 0
  const { data: yaDom } = await supabase
    .from('cuadres_domicilios').select('fecha').eq('fecha', hoy).maybeSingle()
  if (!yaDom) {
    try {
      const cuadre = await getCuadreDia(hoy, supabase)
      if (cuadre.total_domicilios > 0) {
        const { error: errDom } = await supabase.from('cuadres_domicilios').insert({
          fecha:       hoy,
          cerrado_por: admin.id,
          total_neto:  cuadre.total_neto,
          resumen:     { automatico: true, por_mensajeria: cuadre.por_mensajeria, total_domicilios: cuadre.total_domicilios },
        })
        if (!errDom) domiciliosCerrados = 1
      }
    } catch (e) {
      console.error('Cierre automático de domicilios falló:', e)
    }
  }

  return NextResponse.json({ cerradas: creadas, domicilios: domiciliosCerrados })
}
