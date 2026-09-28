import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verificarFirmaMeta, extraerMensaje } from '@/lib/whatsapp/verify'
import { enviarMensajeWhatsApp, marcarComoLeido } from '@/lib/whatsapp/send'
import { buscarAccesoRonaldo, procesarMensajeRonaldo } from '@/lib/ronaldo/agente'

// El agente puede encadenar varias consultas; Meta exige 200 rápido, así que el
// trabajo corre en after() y esta es la vida máxima de la función.
export const maxDuration = 60

// Verificación del webhook al registrarlo en Meta for Developers.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const esperado = process.env.WHATSAPP_VERIFY_TOKEN
  if (
    esperado &&
    params.get('hub.mode') === 'subscribe' &&
    params.get('hub.verify_token') === esperado
  ) {
    return new Response(params.get('hub.challenge') ?? '', { status: 200 })
  }
  return new Response('Forbidden', { status: 403 })
}

export async function POST(request: Request) {
  const cuerpo = await request.text()
  if (!verificarFirmaMeta(cuerpo, request.headers.get('x-hub-signature-256'))) {
    return new Response('Firma inválida', { status: 401 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(cuerpo)
  } catch {
    return new Response('ok', { status: 200 })
  }

  const msg = extraerMensaje(payload)
  if (!msg) return new Response('ok', { status: 200 })

  after(async () => {
    const admin = createAdminClient()

    // Meta reintenta si no recibe 200 a tiempo: el wamid único evita responder dos veces.
    const { error: dup } = await admin.from('ronaldo_mensajes_log').insert({
      wamid: msg.wamid,
      telefono: msg.de,
      direccion: 'entrante',
      contenido: msg.texto || `[${msg.tipo}]`,
    })
    if (dup) {
      if (dup.code !== '23505') console.error('[ronaldo] no se pudo registrar el mensaje', dup.message)
      return
    }

    const acceso = await buscarAccesoRonaldo(admin, msg.de)
    if (!acceso) {
      // Número no autorizado: no se responde (no revelar el bot) ni se gasta IA.
      await admin.from('ronaldo_mensajes_log').update({ error: 'no_autorizado' }).eq('wamid', msg.wamid)
      return
    }

    await marcarComoLeido(msg.wamid)

    let respuesta: string
    let herramientas = 0
    let error: string | null = null
    try {
      if (msg.tipo !== 'text' || !msg.texto.trim()) {
        respuesta = 'Por ahora solo entiendo mensajes de texto.'
      } else {
        const r = await procesarMensajeRonaldo(admin, msg.de, acceso, msg.texto)
        respuesta = r.respuesta
        herramientas = r.herramientas
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
      respuesta = 'Tuve un problema procesando tu mensaje. Intenta de nuevo en un momento.'
    }

    try {
      await enviarMensajeWhatsApp(msg.de, respuesta)
    } catch (e) {
      error = [error, e instanceof Error ? e.message : String(e)].filter(Boolean).join(' | ')
    }

    await admin.from('ronaldo_mensajes_log').insert({
      telefono: msg.de,
      direccion: 'saliente',
      contenido: respuesta,
      herramientas,
      error,
    })
  })

  return new Response('ok', { status: 200 })
}
