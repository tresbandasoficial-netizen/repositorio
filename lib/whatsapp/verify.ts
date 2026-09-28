// Verificación de firma HMAC-SHA256 de webhooks de Meta
// https://developers.facebook.com/docs/messenger-platform/webhooks#validation

import { createHmac, timingSafeEqual } from 'crypto'

export function verificarFirmaMeta(
  body: string,
  signatureHeader: string | null
): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET
  if (!secret) return false          // sin secret → rechazar siempre
  if (!signatureHeader) return false

  const [algo, firma] = signatureHeader.split('=')
  if (algo !== 'sha256' || !firma) return false

  const esperado = createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('hex')

  try {
    return timingSafeEqual(
      Buffer.from(firma, 'hex'),
      Buffer.from(esperado, 'hex')
    )
  } catch {
    return false
  }
}

export type MensajeEntrante = {
  wamid: string
  de: string           // número del remitente, formato Meta sin +
  tipo: string         // text | audio | image | ...
  texto: string        // vacío si no es texto
}

// Meta también manda eventos de estado (entregado/leído) sin `messages`: devuelve null.
type PayloadMeta = {
  entry?: { changes?: { value?: { messages?: {
    id?: string; from?: string; type?: string; text?: { body?: string }
  }[] } }[] }[]
}

export function extraerMensaje(payload: unknown): MensajeEntrante | null {
  const msg = (payload as PayloadMeta | null)?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
  if (!msg?.id || !msg?.from) return null
  return {
    wamid: String(msg.id),
    de:    String(msg.from),
    tipo:  String(msg.type ?? ''),
    texto: msg.type === 'text' ? String(msg.text?.body ?? '') : '',
  }
}
