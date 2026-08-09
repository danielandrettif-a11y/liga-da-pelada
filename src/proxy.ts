import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export default async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname
  const isAdminRoute =
    pathname.startsWith('/admin') ||
    /^\/rodadas\/[^/]+\/nova-partida$/.test(pathname)
  const isAccountRoute = pathname.startsWith('/meu-perfil')
  let isAdmin = false

  if (user && (isAdminRoute || pathname === '/login' || pathname === '/cadastro')) {
    const { data: profile } = await supabase
      .from('account_profiles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()
    isAdmin = profile?.role === 'admin'
  }

  if (isAdminRoute && !isAdmin) {
    if (user) return NextResponse.redirect(new URL('/', request.url))
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (isAccountRoute && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && (pathname === '/login' || pathname === '/cadastro')) {
    return NextResponse.redirect(new URL(isAdmin ? '/' : '/meu-perfil', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
