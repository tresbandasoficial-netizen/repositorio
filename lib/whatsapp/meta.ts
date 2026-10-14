import { createHmac, timingSafeEqual } from 'node:crypto'

const VERSION_API = 'v21.0'

// Meta firma cada llamada al webhook con el "App Secret" de la app:
// cabecera X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(cuerpo crudo).
export function firmaValida(cuerpoCrudo: string, cabecera: string | null): boolean {
  const secreto = process.env.WHATSAPP_APP_SECRET
  if (!secreto || !cabecera?.startsWith('sha256=')) return false
  const esperada = createHmac('sha256', secreto).update(cuerpoCrudo).digest()
  const recibida = Buffer.from(cabecera.slice('sha256='.length), 'hex')
  return recibida.length === esperada.length && timingSafeEqual(recibida, esperada)
}

// WhatsApp admite hasta 4096 caracteres por mensaje.
export async function enviarTexto(para: string, texto: string): Promise<void> {
  const token = process.env.WHATSAPP_TOKEN
  const numeroId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !numeroId) throw new Error('Faltan WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID')
  const r = await fetch(`https://graph.facebook.com/${VERSION_API}/${numeroId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: para,
      type: 'text',
      text: { body: texto.slice(0, 4000) },
    }),
    signal: AbortSignal.timeout(15000),
  })
  if (!r.ok) throw new Error(`WhatsApp respondió ${r.status}: ${(await r.text()).slice(0, 300)}`)
}
