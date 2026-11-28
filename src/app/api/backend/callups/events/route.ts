import { cookies } from "next/headers";
import { ACTIVE_LEAGUE_COOKIE } from "@/lib/league-context";
import { createClient } from "@/lib/supabase/server";

const responseHeaders = {
  "Cache-Control": "private, no-cache, no-transform",
  "Content-Type": "text/event-stream; charset=utf-8",
  "X-Accel-Buffering": "no",
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const leagueId = url.searchParams.get("leagueId");
  const callupId = url.searchParams.get("callupId");
  const selectedLeagueId = (await cookies()).get(ACTIVE_LEAGUE_COOKIE)?.value;
  if (process.env.CALLUPS_API_ENABLED !== "true" || !leagueId || !callupId || leagueId !== selectedLeagueId) {
    return Response.json({ message: "Canal indisponível." }, { status: 404 });
  }

  const client = await createClient();
  const { data: { session } } = await client.auth.getSession();
  const accessToken = session?.access_token;
  const backendUrl = process.env.CALLUPS_BACKEND_URL || process.env.INTERNAL_BACKEND_URL || process.env.BACKEND_API_URL;
  if (!accessToken) return Response.json({ message: "Sessão necessária." }, { status: 401 });
  if (!backendUrl) return Response.json({ message: "Canal indisponível." }, { status: 503 });

  const upstream = await fetch(
    `${backendUrl.replace(/\/+$/, "")}/api/callups/leagues/${encodeURIComponent(leagueId)}/${encodeURIComponent(callupId)}/events`,
    {
      cache: "no-store",
      headers: { authorization: `Bearer ${accessToken}`, accept: "text/event-stream" },
      signal: request.signal,
    },
  );
  if (!upstream.ok || !upstream.body) {
    return Response.json({ message: "Canal indisponível." }, { status: upstream.status || 502 });
  }
  return new Response(upstream.body, { status: 200, headers: responseHeaders });
}
