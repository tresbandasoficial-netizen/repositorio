// Cliente mínimo de la Admin API de Shopify (GraphQL) para "Pedido por Link".
// Solo se usa en el SERVER. Configuración por variables de entorno en Vercel:
//   SHOPIFY_STORE_DOMAIN  → ej. "t10v1h-g2.myshopify.com"
//   SHOPIFY_ADMIN_TOKEN   → token de la app personalizada (shpat_…)
//   SHOPIFY_WEBHOOK_SECRET→ secreto de firma de los webhooks
// El token NUNCA se registra en logs ni viaja al cliente.

const API_VERSION = '2024-10'

export function shopifyConfigurado(): boolean {
  return Boolean(process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ADMIN_TOKEN)
}

export type ShopifyGraphQLResult =
  | { ok: true; data: any }
  | { ok: false; error: string }

export async function shopifyAdminGraphQL(
  query: string,
  variables: Record<string, unknown>,
): Promise<ShopifyGraphQLResult> {
  const domain = process.env.SHOPIFY_STORE_DOMAIN
  const token = process.env.SHOPIFY_ADMIN_TOKEN
  if (!domain || !token) {
    return { ok: false, error: 'Shopify no está configurado (faltan SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_TOKEN en Vercel)' }
  }

  let res: Response
  try {
    res = await fetch(`https://${domain}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ query, variables }),
      // Los borradores se crean en el momento: nada de caché.
      cache: 'no-store',
    })
  } catch {
    return { ok: false, error: 'No se pudo conectar con Shopify — revisa el dominio o la red' }
  }

  if (!res.ok) {
    // 401/403 = token malo o sin permisos; no filtrar el cuerpo (puede traer detalles internos).
    return { ok: false, error: `Shopify respondió ${res.status} — revisa el token y sus permisos (write_draft_orders)` }
  }

  const json = await res.json().catch(() => null)
  if (!json) return { ok: false, error: 'Respuesta inválida de Shopify' }
  if (Array.isArray(json.errors) && json.errors.length > 0) {
    return { ok: false, error: `Shopify: ${json.errors.map((e: any) => e?.message ?? '').join('; ').slice(0, 300)}` }
  }
  return { ok: true, data: json.data }
}
