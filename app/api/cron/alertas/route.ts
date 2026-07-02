import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getResend, EMAIL_FROM } from '@/lib/email/resend'
import { alertaEmailHtml, alertaEmailSubject } from '@/lib/email/template'

// Protegido con CRON_SECRET para que solo el cron de Vercel (o el admin) pueda llamarlo.
// Configurar en vercel.json:
//   { "crons": [{ "path": "/api/cron/alertas", "schedule": "0 13 * * *" }] }
// Vercel adjunta automáticamente el header Authorization cuando llama a cron routes.

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

  const supabase = await createClient()

  // Detectar alertas nuevas y crear notificaciones en DB
  const { data: nuevas, error } = await supabase.rpc('procesar_alertas')

  if (error) {
    console.error('[cron/alertas] error en procesar_alertas:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!nuevas || nuevas.length === 0) {
    return NextResponse.json({ procesadas: 0 })
  }

  const resend = getResend()

  if (!resend) {
    console.warn('[cron/alertas] RESEND_API_KEY no configurado — alertas creadas en DB, emails omitidos')
    return NextResponse.json({ procesadas: nuevas.length, emails_enviados: 0, emails_omitidos: nuevas.length })
  }

  // Enviar emails — en paralelo, con manejo individual de errores
  const resultados = await Promise.allSettled(
    nuevas.map(async (n: {
      notificacion_id: string
      usuario_email: string
      usuario_nombre: string
      pedido_numero: string
      pedido_estado: string
      alerta_tipo: string
    }) => {
      await resend.emails.send({
        from: EMAIL_FROM,
        to: n.usuario_email,
        subject: alertaEmailSubject(n.alerta_tipo, n.pedido_numero),
        html: alertaEmailHtml({
          destinatario: n.usuario_nombre,
          pedidoNumero:  n.pedido_numero,
          pedidoEstado:  n.pedido_estado,
          alertaTipo:    n.alerta_tipo as 'tiempo_excedido' | 'zombie',
        }),
      })
      await supabase
        .from('notificaciones')
        .update({ email_enviado: true })
        .eq('id', n.notificacion_id)
    })
  )

  const enviados = resultados.filter((r) => r.status === 'fulfilled').length
  const fallidos = resultados.filter((r) => r.status === 'rejected').length

  if (fallidos > 0) {
    console.error(`[cron/alertas] ${fallidos} emails fallaron`)
  }

  return NextResponse.json({ procesadas: nuevas.length, emails_enviados: enviados, emails_fallidos: fallidos })
}
