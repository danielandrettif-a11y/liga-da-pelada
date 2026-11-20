import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseServerConfig } from './server-config'

export async function createClient() {
  const cookieStore = await cookies()
  const config = supabaseServerConfig(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_INTERNAL_URL)

  return createServerClient(
    config.url,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { name: config.cookieName },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch (error) {
            // ignorar caso esteja em um server component
          }
        },
      },
    }
  )
}
