import { NextRequest, NextResponse } from 'next/server'

// HERRAMIENTA TEMPORAL de diagnóstico del asistente de WhatsApp.
// Protegida con el mismo token de verificación del webhook (?clave=...).
// Muestra qué variables existen (nunca sus valores), a qué apps está suscrita la
// cuenta de WhatsApp y, si se pide, la suscribe o envía un mensaje de prueba.
// Se borra cuando el asistente quede funcionando.

const WABA_ID = process.env.WHATSAPP_WABA_ID || '2023758424962290'
const API = 'https://graph.facebook.com/v21.0'

async function graph(path: string, metodo: 'GET' | 'POST', cuerpo?: unknown) {
  const token = process.env.WHATSAPP_TOKEN
  const r = await fetch(`${API}/${path}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    signal: AbortSignal.timeout(15000),
  })
  let json: unknown = null
  try { json = await r.json() } catch { /* sin cuerpo */ }
  return { status: r.status, json }
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const verify = process.env.WHATSAPP_VERIFY_TOKEN
  if (!verify || p.get('clave') !== verify) return new Response('Forbidden', { status: 403 })

  const salida: Record<string, unknown> = {
    variables: {
      WHATSAPP_VERIFY_TOKEN: !!process.env.WHATSAPP_VERIFY_TOKEN,
      WHATSAPP_APP_SECRET: !!process.env.WHATSAPP_APP_SECRET,
      WHATSAPP_TOKEN: !!process.env.WHATSAPP_TOKEN,
      WHATSAPP_PHONE_NUMBER_ID: !!process.env.WHATSAPP_PHONE_NUMBER_ID,
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
    },
    waba: WABA_ID,
  }

  try {
    salida.apps_suscritas_antes = await graph(`${WABA_ID}/subscribed_apps`, 'GET')
    if (p.get('suscribir') === '1') {
      salida.suscripcion = await graph(`${WABA_ID}/subscribed_apps`, 'POST')
      salida.apps_suscritas_despues = await graph(`${WABA_ID}/subscribed_apps`, 'GET')
    }
    const para = (p.get('enviar') ?? '').replace(/\D/g, '')
    if (para) {
      const numeroId = process.env.WHATSAPP_PHONE_NUMBER_ID
      salida.envio = await graph(`${numeroId}/messages`, 'POST', {
        messaging_product: 'whatsapp',
        to: para,
        type: 'text',
        text: { body: 'Prueba del asistente de Tres Bandas: si lees esto, el envío funciona.' },
      })
    }
  } catch (e) {
    salida.error = e instanceof Error ? e.message : String(e)
  }
  return NextResponse.json(salida)
}
