import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Presupuesto TOTAL del middleware para hablar con Supabase Auth. El cliente
// de auth reintenta por su cuenta cuando un fetch falla, así que un límite por
// fetch no basta: los reintentos acumulados superaban los 25s y Vercel mataba
// el middleware (504 para el usuario, 401 timeouts entre el 27 y 29 de agosto).
const PRESUPUESTO_AUTH_MS = 5000

// Límite de cada fetch individual a Supabase Auth, dentro del presupuesto.
const TIMEOUT_FETCH_MS = 4000

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(TIMEOUT_FETCH_MS) }),
      },
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getSession lee la sesión de la cookie SIN ir a Supabase; solo hace red
  // cuando el access token ya venció (para renovarlo y reescribir la cookie,
  // cosa que las páginas no pueden hacer). Así la caída o lentitud de Supabase
  // Auth no tumba la app: el caso común ni siquiera sale del edge.
  //
  // Esto decide únicamente el redirect a /login. La validación real de la
  // sesión la hace cada página en el servidor (getSesion → auth.getUser), así
  // que nadie entra sin login aunque aquí se deje pasar.
  let user: { id: string } | null = null
  try {
    const resultado = await Promise.race([
      supabase.auth.getSession(),
      new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), PRESUPUESTO_AUTH_MS)),
    ])
    if (resultado === 'timeout') return supabaseResponse
    // error ≠ sin sesión: si la renovación falló (red/timeout) se deja pasar
    // en vez de botar a /login a un usuario con refresh token válido.
    if (resultado.error) return supabaseResponse
    user = resultado.data.session?.user ?? null
  } catch {
    return supabaseResponse
  }

  const pathname = request.nextUrl.pathname
  // /api/cron/* se protege por su cuenta con CRON_SECRET (Bearer). No debe pasar
  // por la sesión: los llama Vercel Cron sin cookie, y el middleware lo mandaría
  // a /login, impidiendo que el cierre automático y las alertas se ejecuten.
  const isPublicPath =
    pathname === '/login' ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/cron')

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
