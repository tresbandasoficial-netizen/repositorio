import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const type = searchParams.get('type') // 'invite' | 'recovery' | 'magiclink'

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=link_invalido', origin))
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(new URL('/login?error=link_expirado', origin))
  }

  // Invitados y recuperación de contraseña van a definir su clave
  if (type === 'invite' || type === 'recovery') {
    return NextResponse.redirect(
      new URL(`/auth/set-password?reason=${type}`, origin)
    )
  }

  return NextResponse.redirect(new URL('/dashboard', origin))
}
