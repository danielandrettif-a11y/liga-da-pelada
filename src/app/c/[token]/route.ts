import { NextResponse, type NextRequest } from "next/server";
import { ACTIVE_LEAGUE_COOKIE } from "@/lib/league-context";
import { createServiceClient } from "@/lib/supabase/service";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Entrega a convocação pelo endereço curto sem redirecionar o navegador.
 * Isso mantém a URL inteira clicável no WhatsApp e dentro do escopo do PWA.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const destination = request.nextUrl.clone();
  destination.pathname = "/convocacao";
  destination.search = "";
  destination.searchParams.set("invite", token);

  const serviceClient = UUID_PATTERN.test(token) ? createServiceClient() : null;
  const { data: callup } = serviceClient
    ? await serviceClient
      .from("callups")
      .select("id, league_id")
      .eq("invite_token", token)
      .in("status", ["open", "locked", "converted"])
      .maybeSingle()
    : { data: null };

  if (callup) destination.searchParams.set("callup", callup.id);

  const response = NextResponse.rewrite(destination);
  if (callup?.league_id) {
    response.cookies.set(ACTIVE_LEAGUE_COOKIE, callup.league_id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
}
