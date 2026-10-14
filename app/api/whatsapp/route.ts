import { NextRequest, NextResponse, after } from 'next/server'
import { enviarTexto, firmaValida } from '@/lib/whatsapp/meta'
import { numerosAutorizados } from '@/lib/whatsapp/consultas'
import { responder } from '@/lib/whatsapp/asistente'

// Webhook de WhatsApp Cloud API (Meta). El dueño escribe al número del negocio
// y el asistente le contesta con información del sistema (solo lectura).
//
// Seguridad:
//  - GET: verificación inicial de Meta con WHATSAPP_VERIFY_TOKEN.
//  - POST: se exige la firma HMAC (WHATSAPP_APP_SECRET); sin ella no se procesa nada.
//  - Solo contesta a los números de configuracion.whatsapp_autorizados; a los
//    demás no les responde (ni confirma que el número existe).
//  - Esta ruta es pública en el middleware: no depende de sesión.

export const maxDuration = 60

// Meta reintenta si no recibe 200 pronto: se evita contestar dos veces el mismo mensaje.
const procesados = new Set<string>()

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const token = process.env.WHATSAPP_VERIFY_TOKEN
  if (token && p.get('hub.mode') === 'subscribe' && p.get('hub.verify_token') === token) {
    return new Response(p.get('hub.challenge') ?? '', { status: 200 })
  }
  return new Response('Forbidden', { status: 403 })
}

type MensajeEntrante = { from?: string; id?: string; type?: string; text?: { body?: string } }

export async function POST(req: NextRequest) {
  const cuerpo = await req.text()
  if (!process.env.WHATSAPP_APP_SECRET) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }
  if (!firmaValida(cuerpo, req.headers.get('x-hub-signature-256'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: { entry?: Array<{ changes?: Array<{ value?: { messages?: MensajeEntrante[] } }> }> }
  try {
    payload = JSON.parse(cuerpo)
  } catch {
    return NextResponse.json({ ok: true })
  }

  const mensajes = (payload.entry ?? [])
    .flatMap(e => e.changes ?? [])
    .flatMap(c => c.value?.messages ?? [])
    .filter(m => m.from && m.id && !procesados.has(m.id))
  for (const m of mensajes) {
    procesados.add(m.id!)
    if (procesados.size > 500) procesados.delete(procesados.values().next().value as string)
  }

  if (mensajes.length > 0) {
    // Se responde 200 a Meta de inmediato y el trabajo sigue después.
    after(async () => {
      try {
        const autorizados = await numerosAutorizados()
        for (const m of mensajes) {
          const numero = m.from!.replace(/\D/g, '')
          if (!autorizados.includes(numero)) continue
          const respuesta = m.type === 'text' && m.text?.body
            ? await responder(m.text.body)
            : 'Por ahora solo entiendo mensajes de texto.'
          await enviarTexto(numero, respuesta)
        }
      } catch (e) {
        console.error('[whatsapp] error procesando mensajes:', e)
      }
    })
  }

  return NextResponse.json({ ok: true })
}
