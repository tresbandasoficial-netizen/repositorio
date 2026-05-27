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
  fecha: string         // YYYY-MM-DD
  numero_factura: string  // número/código de la factura, vacío si no aparece
  subtotal_usd: number   // subtotal antes de tax y shipping (después de descuentos), en la moneda de la factura
  tax_usd: number        // total de impuestos, en la moneda de la factura
  shipping_usd: number
  total_usd: number      // total final, en la moneda de la factura
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
- CRÍTICO: cada talla diferente es un ítem SEPARADO, aunque sea el mismo producto. Si hay una Camiseta en talla S y otra en talla M, son DOS ítems distintos, nunca uno solo con cantidad 2
- Si hay 2 unidades del mismo producto en la MISMA talla, ese sí es un ítem con cantidad 2
- Si no encuentras la marca por separado, intenta inferirla del nombre del producto
- numero_factura: número, código o referencia de la factura. String vacío si no aparece
- precio_usd de cada item: precio FINAL de ESA LÍNEA COMPLETA (todas las unidades de esa talla), después de descuentos, ANTES de tax y shipping
- subtotal_usd: suma de todos los precios de productos antes de tax y shipping
- tax_usd: monto total de impuestos/taxes (0 si no aparece)
- shipping_usd: costo de envío total (0 si no aparece)
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
- CRÍTICO: cada talla diferente es un ítem SEPARADO, aunque sea el mismo producto. Si hay una Camiseta en talla S y otra en talla M, son DOS ítems distintos, nunca uno solo con cantidad 2
- Si hay 2 unidades del mismo producto en la MISMA talla, ese sí es un ítem con cantidad 2
- Si no encuentras la marca, deja string vacío
- numero_factura: número o código de la factura. String vacío si no aparece
- IMPORTANTE — notación colombiana: el PUNTO es separador de MILES y la COMA es separador decimal. Ejemplos: "$449.925,00" = 449925, "$1.200.000" = 1200000, "$97.462,50" = 97463, "$179.925,00" = 179925. Extrae siempre como número entero (redondea si hay centavos)
- precio_usd de cada item: el precio TOTAL de esa línea para todas las unidades de ese producto/talla, exactamente como aparece en la factura (en pesos colombianos, número entero)
- total_usd: total final de la factura en pesos colombianos (número entero)
- subtotal_usd, tax_usd, shipping_usd: ponlos en 0 (no aplican)
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
              { type: 'input_text', text: tipo === 'colombia' ? PROMPT_COP : PROMPT_USD },
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
              { type: 'text', text: tipo === 'colombia' ? PROMPT_COP : PROMPT_USD },
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
