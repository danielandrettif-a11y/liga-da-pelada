import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { ENTRY_FLOW_DONE_COOKIE, ENTRY_FLOW_PENDING_COOKIE, ENTRY_FLOW_VERSION, isEntryFlowScreen } from '@/lib/entry-flow'
import { requestOrigin } from '@/lib/siteUrl'

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
  const origin = requestOrigin(request)
  const isAdminRoute =
    pathname.startsWith('/admin') ||
    /^\/rodadas\/[^/]+\/nova-partida$/.test(pathname)
  const isAccountRoute = pathname.startsWith('/meu-perfil')
  const isLeagueSelectionRoute = pathname === '/lobby' || pathname.startsWith('/lobby/') || pathname === '/peladas'
  const isPublicRoute = pathname === '/inicio' || pathname === '/estadio'
    || pathname === '/bq-manager/demo'
    || pathname.startsWith('/login') || pathname.startsWith('/cadastro')
    || pathname.startsWith('/auth/') || pathname.startsWith('/convite/')
    || pathname.startsWith('/redefinir-senha') || pathname.startsWith('/api/')
    || pathname.startsWith('/internal/')
  const loginUrl = new URL('/login', origin)
  loginUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`)
  let isAdmin = false
  let hasMembership = false
  let needsLeagueChoice = false
  let isBasicLeague = false

  if (pathname === '/' && !user) return NextResponse.redirect(new URL('/inicio', origin))

  if (user) {
    const { data: memberships } = await supabase
      .from('league_members')
      .select('league_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
    hasMembership = Boolean(memberships?.length)
    const selectedLeagueId = request.cookies.get('active_league_id')?.value
    const selectedMembership = memberships?.find((item) => item.league_id === selectedLeagueId)
      || (memberships?.length === 1 ? memberships[0] : null)
    needsLeagueChoice = Boolean((memberships?.length || 0) > 1 && !selectedMembership)
    isAdmin = selectedMembership?.role === 'admin'
    if (selectedMembership) {
      const { data: league } = await supabase.from('leagues').select('feature_tier').eq('id', selectedMembership.league_id).maybeSingle()
      isBasicLeague = league?.feature_tier === 'basic'
    }

    const entryFlowDone = request.cookies.get(ENTRY_FLOW_DONE_COOKIE)?.value === String(ENTRY_FLOW_VERSION)
    const entryFlowPending = Boolean(request.cookies.get(ENTRY_FLOW_PENDING_COOKIE)?.value)
    const canRedirectToPresentation = !pathname.startsWith('/api/')
      && !pathname.startsWith('/internal/')
      && !pathname.startsWith('/auth/')
    if (!entryFlowDone) {
      if (entryFlowPending) {
        if (canRedirectToPresentation && !isEntryFlowScreen(pathname)) {
          return NextResponse.redirect(new URL('/inicio?apresentacao=1', origin))
        }
      } else {
        const { data: accountProfile, error: entryFlowError } = await supabase
          .from('account_profiles')
          .select('entry_flow_version')
          .eq('user_id', user.id)
          .maybeSingle()
        // Permite implantação sem interrupção caso o código chegue poucos
        // segundos antes da migration que adiciona a campanha versionada.
        if (!entryFlowError && Number(accountProfile?.entry_flow_version || 0) < ENTRY_FLOW_VERSION && canRedirectToPresentation) {
          const reentryUrl = new URL('/auth/reentry', origin)
          reentryUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`)
          return NextResponse.redirect(reentryUrl)
        }
        if (!entryFlowError && Number(accountProfile?.entry_flow_version || 0) >= ENTRY_FLOW_VERSION) {
          supabaseResponse.cookies.set(ENTRY_FLOW_DONE_COOKIE, String(ENTRY_FLOW_VERSION), {
            httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365,
          })
        }
      }
    }
  }

  if (isAdminRoute && !isAdmin) {
    if (user) return NextResponse.redirect(new URL('/lobby', origin))
    return NextResponse.redirect(loginUrl)
  }

  if (!isPublicRoute && !user) return NextResponse.redirect(loginUrl)
  if (!isPublicRoute && !isLeagueSelectionRoute && user && !hasMembership) {
    return NextResponse.redirect(new URL('/lobby', origin))
  }
  if (!isPublicRoute && !isLeagueSelectionRoute && user && needsLeagueChoice) {
    return NextResponse.redirect(new URL('/lobby', origin))
  }
  const isFullFeatureRoute = pathname.startsWith('/cartola') || pathname.startsWith('/bq-manager')
    || pathname.startsWith('/coletiva') || pathname.startsWith('/admin/cartola')
    || pathname.startsWith('/mais/coletivas')
  if (user && isBasicLeague && isFullFeatureRoute) {
    return NextResponse.redirect(new URL('/mais?upgrade_required=1', origin))
  }

  if (isAccountRoute && !user) {
    return NextResponse.redirect(loginUrl)
  }

  if (user && (pathname === '/login' || pathname === '/cadastro')) {
    return NextResponse.redirect(new URL('/lobby', origin))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|api/internal/observability|favicon.ico|manifest.webmanifest|offline.html|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
