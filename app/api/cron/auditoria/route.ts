import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getResend, EMAIL_FROM } from '@/lib/email/resend'
import { hoyBogota, formatCOP } from '@/lib/utils/format'
import { ayerBogota, generarInformeSede } from '@/lib/auditoria/informe'

// Auditor diario de Santa Rosa. Corre de madrugada (vercel.json) y deja el
// informe del día anterior en /auditoria. Si hay RESEND_API_KEY, además manda
// un resumen por correo a los administradores. Solo lee: no modifica dinero.
const SEDES_AUDITADAS = ['SR']

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const fecha = ayerBogota(hoyBogota())
  const resultados: Array<{ sede: string; ok: boolean; alta?: number; media?: number; error?: string }> = []
  const resumenes: string[] = []

  for (const sede of SEDES_AUDITADAS) {
    const r = await generarInformeSede(sede, fecha)
    if (!r.ok) {
      console.error(`[cron/auditoria] ${sede}: ${r.error}`)
      resultados.push({ sede, ok: false, error: r.error })
      continue
    }
    const altas = r.informe.hallazgos.filter(h => h.severidad === 'alta')
    const medias = r.informe.hallazgos.filter(h => h.severidad === 'media')
    resultados.push({ sede, ok: true, alta: altas.length, media: medias.length })
    const s = r.informe.resumen
    resumenes.push(
      `<h3 style="margin:16px 0 4px">Santa Rosa — ${fecha}</h3>` +
      `<p style="margin:0">Pedidos: ${s.pedidos_n} (${formatCOP(s.pedidos_total)}) · Cobros: ${formatCOP(s.cobros_total)} · ` +
      `Deuda total: ${formatCOP(s.deuda_total)} (${formatCOP(s.deuda_mas_30)} con más de 30 días)</p>` +
      `<ul>${[...altas, ...medias].map(h =>
        `<li><b>${h.severidad === 'alta' ? '🔴' : '🟡'} ${h.titulo}</b>: ${h.cantidad}${h.monto ? ` · ${formatCOP(h.monto)}` : ''}</li>`).join('') || '<li>Sin hallazgos</li>'}</ul>`
    )
  }

  // Correo opcional a los administradores.
  const resend = getResend()
  let correos = 0
  if (resend && resumenes.length > 0) {
    const admin = createAdminClient()
    const { data: admins } = await admin.from('usuarios').select('email').eq('rol', 'admin').eq('activo', true)
    const para = (admins ?? []).map(a => a.email).filter(Boolean) as string[]
    if (para.length > 0) {
      try {
        await resend.emails.send({
          from: EMAIL_FROM,
          to: para,
          subject: `Auditoría diaria Santa Rosa — ${fecha}`,
          html: `<div style="font-family:system-ui,sans-serif">${resumenes.join('')}<p style="color:#6b7280;font-size:12px">Detalle completo en el sistema: Auditoría.</p></div>`,
        })
        correos = para.length
      } catch (e) {
        console.error('[cron/auditoria] el correo falló:', e)
      }
    }
  }

  return NextResponse.json({ fecha, resultados, correos })
}
