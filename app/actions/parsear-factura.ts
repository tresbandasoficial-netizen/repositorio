'use server'

import Anthropic from '@anthropic-ai/sdk'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export type FacturaItemExtraido = {
  descripcion: string
  marca: string
  talla: string
  cantidad: number
  precio_usd: number
}

export type FacturaExtraida = {
  proveedor: string
  fecha: string
  numero_factura: string
  subtotal_usd: number
  tax_usd: number
  shipping_usd: number
  total_usd: number
  items: FacturaItemExtraido[]
}

export type ParsearFacturaResult =
  | { ok: true; data: FacturaExtraida }
  | { ok: false; error: string }

const PROMPT_USD = `Eres un extractor de facturas de compras de ropa y calzado en dólares (USD).
Analiza esta factura y devuelve ÚNICAMENTE un objeto JSON con esta estructura exacta (sin markdown, sin explicación):

{
  "proveedor": "nombre del proveedor/tienda",
  "fecha": "YYYY-MM-DD",
  "numero_factura": "INV-12345",
  "subtotal_usd": 100.00,
  "tax_usd": 7.00,
  "shipping_usd": 12.00,
  "total_usd": 119.00,
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
- CRÍTICO: cada talla diferente es un ítem SEPARADO, aunque sea el mismo producto
- Si hay 2 unidades del mismo producto en la MISMA talla, ese sí es un ítem con cantidad 2
- numero_factura: número, código o referencia de la factura. String vacío si no aparece
- precio_usd de cada item: precio FINAL de ESA LÍNEA COMPLETA, después de descuentos, ANTES de tax y shipping
- total_usd: total final incluyendo todo
- Devuelve SOLO el JSON, sin texto adicional`

const PROMPT_COP = `Eres un extractor de facturas de compras de ropa y calzado en pesos colombianos (COP).
Analiza esta factura y devuelve ÚNICAMENTE un objeto JSON con esta estructura exacta (sin markdown, sin explicación):

{
  "proveedor": "nombre del proveedor/tienda",
  "fecha": "YYYY-MM-DD",
  "numero_factura": "FAC-001",
  "subtotal_usd": 0,
  "tax_usd": 0,
  "shipping_usd": 0,
  "total_usd": 350000,
  "items": [
    {
      "descripcion": "descripción del producto",
      "marca": "marca si aparece, sino string vacío",
      "talla": "talla si aparece, sino string vacío",
      "cantidad": 1,
      "precio_usd": 120000
    }
  ]
}

Reglas:
- CRÍTICO: cada talla diferente es un ítem SEPARADO
- Si hay 2 unidades del mismo producto en la MISMA talla, ese sí es un ítem con cantidad 2
- IMPORTANTE — los precios pueden venir en varios formatos, interprétalos todos como pesos colombianos y extrae siempre un número entero:
  · "$449.925,00" → 449925  (punto=miles, coma=decimal)
  · "$1.200.000" → 1200000
  · "$ 120.000" → 120000
  · "COP 350,000" → 350000  (coma=miles estilo inglés)
- precio_usd de cada item: el precio TOTAL de esa línea en pesos colombianos (número entero)
- total_usd: total final de la factura en pesos colombianos (número entero)
- subtotal_usd, tax_usd, shipping_usd: ponlos en 0
- Devuelve SOLO el JSON, sin texto adicional`

export async function parsearFacturaAction(
  base64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf',
  tipo: 'usa' | 'colombia' = 'usa'
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

  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: 'ANTHROPIC_API_KEY no configurada' }

  const prompt = tipo === 'colombia' ? PROMPT_COP : PROMPT_USD

  const contentBlocks: Anthropic.MessageParam['content'] = []

  if (mediaType === 'application/pdf') {
    contentBlocks.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: base64 },
    } as any)
  } else {
    contentBlocks.push({
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data: base64 },
    })
  }

  contentBlocks.push({ type: 'text', text: prompt })

  let text: string
  try {
    const r = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: contentBlocks }],
    })
    text = r.content[0].type === 'text' ? r.content[0].text : ''
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
