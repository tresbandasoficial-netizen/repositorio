import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        // Tiempo límite a la llamada de auth: sin esto, un colgado ocasional
        // de red dejaba el middleware esperando hasta que Vercel lo mataba a
        // los 25s (504 MIDDLEWARE_INVOCATION_TIMEOUT para el usuario).
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(8000) }),
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

  // Refresca la sesión sin exponer datos del usuario al cliente. Si auth no
  // responde a tiempo, se deja pasar la petición: cada página vuelve a validar
  // la sesión en el servidor (getSesion), así que nadie entra sin login.
  let user: { id: string } | null = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
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
