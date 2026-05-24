'use server'

import Anthropic from '@anthropic-ai/sdk'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type FacturaItemExtraido = {
  descripcion: string
  marca: string
  talla: string
  cantidad: number
  precio_usd: number
}

export type FacturaExtraida = {
  proveedor: string
  fecha: string       // YYYY-MM-DD
  total_usd: number
  items: FacturaItemExtraido[]
}

export type ParsearFacturaResult =
  | { ok: true; data: FacturaExtraida }
  | { ok: false; error: string }

export async function parsearFacturaAction(
  base64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'
): Promise<ParsearFacturaResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', user.id)
    .single()
  if (usuario?.rol !== 'admin') redirect('/dashboard')

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ok: false, error: 'ANTHROPIC_API_KEY no configurada' }

  const client = new Anthropic({ apiKey })

  const source =
    mediaType === 'application/pdf'
      ? ({ type: 'base64', media_type: 'application/pdf', data: base64 } as const)
      : ({ type: 'base64', media_type: mediaType, data: base64 } as const)

  let text: string
  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: mediaType === 'application/pdf' ? 'document' : 'image',
              source,
            } as any,
            {
              type: 'text',
              text: `Eres un extractor de facturas de compras de ropa y calzado.
Analiza esta factura y devuelve ÚNICAMENTE un objeto JSON con esta estructura exacta (sin markdown, sin explicación):

{
  "proveedor": "nombre del proveedor/tienda",
  "fecha": "YYYY-MM-DD",
  "total_usd": 123.45,
  "items": [
    {
      "descripcion": "descripción del producto",
      "marca": "marca (Nike, Adidas, etc.)",
      "talla": "talla si aparece, sino string vacío",
      "cantidad": 1,
      "precio_usd": 89.99
    }
  ]
}

Reglas:
- Extrae CADA artículo por separado aunque sean del mismo producto con distintas tallas
- Si no encuentras la marca por separado, intenta inferirla del nombre del producto
- Si la fecha no está clara, usa la fecha de hoy: ${new Date().toISOString().slice(0, 10)}
- total_usd debe ser el total de la factura en USD
- Si los precios están en otra moneda, conviértelos a USD como aparecen (no calcules nada)
- Devuelve SOLO el JSON, sin texto adicional`,
            },
          ],
        },
      ],
    })

    text = msg.content[0].type === 'text' ? msg.content[0].text : ''
  } catch (e: any) {
    return { ok: false, error: `Error llamando a Claude: ${e.message}` }
  }

  try {
    const json = text.trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '')
    const data = JSON.parse(json) as FacturaExtraida
    return { ok: true, data }
  } catch {
    return { ok: false, error: `No se pudo parsear la respuesta: ${text.slice(0, 200)}` }
  }
}
