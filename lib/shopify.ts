// Cliente mínimo de la Admin API de Shopify (GraphQL) para "Pedido por Link".
// Solo se usa en el SERVER. Configuración por variables de entorno en Vercel:
//   SHOPIFY_STORE_DOMAIN   → ej. "9bwvfh-7y.myshopify.com"
//   SHOPIFY_CLIENT_ID      → Client ID de la app del Dev Dashboard
//   SHOPIFY_CLIENT_SECRET  → Secreto del cliente de esa app
//   SHOPIFY_WEBHOOK_SECRET → secreto de firma de los webhooks (lo usa route.ts)
//   SHOPIFY_ADMIN_TOKEN    → (alternativa) token estático shpat_… si existiera
// Las apps del Dev Dashboard no entregan un token estático: el token se pide
// con el "client credentials grant" (app y tienda en la MISMA organización,
// app instalada en la tienda) y dura 24 h, así que aquí se cachea y se
// renueva solo. Ni el token ni el secreto se registran en logs ni viajan al
// cliente.

const API_VERSION = '2026-07'

// Margen para renovar ANTES de que venza (el grant dura 86399 s).
const MARGEN_RENOVACION_MS = 5 * 60 * 1000

let tokenCache: { token: string; venceEn: number } | null = null

export function shopifyConfigurado(): boolean {
  const domain = process.env.SHOPIFY_STORE_DOMAIN
  const estatico = process.env.SHOPIFY_ADMIN_TOKEN
  const credenciales = process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET
  return Boolean(domain && (estatico || credenciales))
}

type TokenResult = { ok: true; token: string; minted: boolean } | { ok: false; error: string }

async function obtenerToken(domain: string): Promise<TokenResult> {
  // Token estático (custom app vieja): se usa tal cual, sin caché.
  const estatico = process.env.SHOPIFY_ADMIN_TOKEN
  if (estatico) return { ok: true, token: estatico, minted: false }

  const clientId = process.env.SHOPIFY_CLIENT_ID
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return { ok: false, error: 'Shopify no está configurado (faltan SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET en Vercel)' }
  }

  if (tokenCache && Date.now() < tokenCache.venceEn - MARGEN_RENOVACION_MS) {
    return { ok: true, token: tokenCache.token, minted: true }
  }

  let res: Response
  try {
    res = await fetch(`https://${domain}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    return { ok: false, error: 'No se pudo conectar con Shopify para obtener el token — revisa el dominio o la red' }
  }
  if (!res.ok) {
    // 401 = credenciales malas; 400 = app sin instalar u organización distinta.
    // No filtrar el cuerpo: jamás exponer credenciales ni detalles internos.
    return { ok: false, error: `Shopify no entregó token (${res.status}) — revisa SHOPIFY_CLIENT_ID/SECRET y que la app esté instalada en la tienda` }
  }
  const json = await res.json().catch(() => null)
  const token = typeof json?.access_token === 'string' ? json.access_token : ''
  if (!token) return { ok: false, error: 'Shopify no entregó token — respuesta inválida' }

  const expiresIn = Number(json?.expires_in)
  const vidaMs = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn * 1000 : 60 * 60 * 1000
  tokenCache = { token, venceEn: Date.now() + vidaMs }
  return { ok: true, token, minted: true }
}

export type ShopifyGraphQLResult =
  | { ok: true; data: any }
  | { ok: false; error: string }

export async function shopifyAdminGraphQL(
  query: string,
  variables: Record<string, unknown>,
): Promise<ShopifyGraphQLResult> {
  const domain = process.env.SHOPIFY_STORE_DOMAIN
  if (!domain) {
    return { ok: false, error: 'Shopify no está configurado (falta SHOPIFY_STORE_DOMAIN en Vercel)' }
  }

  const llamar = async (token: string): Promise<Response | null> => {
    try {
      return await fetch(`https://${domain}/admin/api/${API_VERSION}/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': token,
        },
        body: JSON.stringify({ query, variables }),
        // Los borradores se crean en el momento: nada de caché.
        cache: 'no-store',
        // Sin tope, un Shopify colgado deja la acción esperando hasta que
        // Vercel la mate con un error opaco (y sin correr la limpieza).
        signal: AbortSignal.timeout(15_000),
      })
    } catch {
      return null
    }
  }

  let auth = await obtenerToken(domain)
  if (!auth.ok) return { ok: false, error: auth.error }

  let res = await llamar(auth.token)
  if (!res) return { ok: false, error: 'No se pudo conectar con Shopify — revisa el dominio o la red' }

  // Un 401 con token generado puede ser un token del caché que Shopify revocó
  // (ej. la app se reinstaló): se bota el caché y se reintenta UNA vez.
  if (res.status === 401 && auth.minted) {
    tokenCache = null
    auth = await obtenerToken(domain)
    if (!auth.ok) return { ok: false, error: auth.error }
    const reintento = await llamar(auth.token)
    if (!reintento) return { ok: false, error: 'No se pudo conectar con Shopify — revisa el dominio o la red' }
    res = reintento
  }

  if (!res.ok) {
    // 401/403 = token malo o sin permisos; no filtrar el cuerpo (puede traer detalles internos).
    return { ok: false, error: `Shopify respondió ${res.status} — revisa las credenciales y sus permisos (write_draft_orders)` }
  }

  const json = await res.json().catch(() => null)
  if (!json) return { ok: false, error: 'Respuesta inválida de Shopify' }
  if (Array.isArray(json.errors) && json.errors.length > 0) {
    return { ok: false, error: `Shopify: ${json.errors.map((e: any) => e?.message ?? '').join('; ').slice(0, 300)}` }
  }
  return { ok: true, data: json.data }
}
