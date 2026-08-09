import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/siteUrl";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (code) {
    const client = await createClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/meu-perfil", SITE_URL));
  }

  return NextResponse.redirect(new URL("/login", SITE_URL));
}
