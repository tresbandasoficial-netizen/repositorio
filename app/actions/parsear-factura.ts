'use server'

import OpenAI from 'openai'
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

const PROMPT = `Eres un extractor de facturas de compras de ropa y calzado.
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
- total_usd debe ser el total de la factura en USD
- Si los precios están en otra moneda, déjalos como aparecen
- Devuelve SOLO el JSON, sin texto adicional`

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

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return { ok: false, error: 'OPENAI_API_KEY no configurada' }

  const client = new OpenAI({ apiKey })

  let text: string
  try {
    if (mediaType === 'application/pdf') {
      // Para PDFs usamos el endpoint de files + responses
      const blob = Buffer.from(base64, 'base64')
      const file = new File([blob], 'factura.pdf', { type: 'application/pdf' })

      const uploaded = await client.files.create({ file, purpose: 'user_data' })

      const response = await client.responses.create({
        model: 'gpt-4o',
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_file', file_id: uploaded.id },
              { type: 'input_text', text: PROMPT },
            ],
          },
        ],
      })

      text = response.output_text ?? ''
      await client.files.delete(uploaded.id).catch(() => {})
    } else {
      // Para imágenes usamos vision directamente
      const response = await client.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: `data:${mediaType};base64,${base64}` },
              },
              { type: 'text', text: PROMPT },
            ],
          },
        ],
      })
      text = response.choices[0]?.message?.content ?? ''
    }
  } catch (e: any) {
    return { ok: false, error: `Error llamando a OpenAI: ${e.message}` }
  }

  try {
    const json = text.trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '')
    const data = JSON.parse(json) as FacturaExtraida
    return { ok: true, data }
  } catch {
    return { ok: false, error: `No se pudo parsear la respuesta: ${text.slice(0, 200)}` }
  }
}
