import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/siteUrl";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next");
  const safeNext = requestedNext?.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : null;

  if (code) {
    const client = await createClient();
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const { data: profile } = await client
        .from("account_profiles")
        .select("player_id")
        .eq("user_id", data.user.id)
        .maybeSingle();

      const destination = safeNext || (profile?.player_id ? "/" : "/meu-perfil");
      return NextResponse.redirect(new URL(destination, SITE_URL));
    }
  }

  return NextResponse.redirect(new URL("/login", SITE_URL));
}
