// Envío de mensajes vía Meta WhatsApp Cloud API
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/messages

const GRAPH_URL = 'https://graph.facebook.com/v21.0'

function getCredentials() {
  const token   = process.env.WHATSAPP_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneId) {
    throw new Error('Faltan variables de entorno: WHATSAPP_TOKEN y/o WHATSAPP_PHONE_NUMBER_ID')
  }
  return { token, phoneId }
}

export async function enviarMensajeWhatsApp(
  para: string,
  texto: string
): Promise<void> {
  const { token, phoneId } = getCredentials()

  // WhatsApp limita a 4096 caracteres por mensaje; partir si es necesario
  const partes = splitTexto(texto, 4000)
  for (const parte of partes) {
    const res = await fetch(`${GRAPH_URL}/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: para,
        type: 'text',
        text: { body: parte, preview_url: false },
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`WhatsApp API error ${res.status}: ${err}`)
    }
  }
}

// Marcar mensaje entrante como leído (mejora UX: aparece el doble check azul)
export async function marcarComoLeido(wamid: string): Promise<void> {
  try {
    const { token, phoneId } = getCredentials()
    await fetch(`${GRAPH_URL}/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: wamid,
      }),
    })
  } catch {
    // no crítico: solo es el doble check azul
  }
}

function splitTexto(texto: string, max: number): string[] {
  if (texto.length <= max) return [texto]
  const partes: string[] = []
  let i = 0
  while (i < texto.length) {
    // cortar en el último salto de línea dentro del bloque, si hay
    let fin = Math.min(i + max, texto.length)
    if (fin < texto.length) {
      const corte = texto.lastIndexOf('\n', fin)
      if (corte > i) fin = corte + 1
    }
    partes.push(texto.slice(i, fin).trim())
    i = fin
  }
  return partes.filter(Boolean)
}
