import { cookies } from "next/headers";
import { ACTIVE_LEAGUE_COOKIE } from "@/lib/league-context";
import { createClient } from "@/lib/supabase/server";
import { callupApiFor } from "@/modules/callups/infrastructure/callup-api-session";
import { ApiError } from "@/modules/shared/domain/api-error";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const leagueId = new URL(request.url).searchParams.get("leagueId");
  const selectedLeagueId = (await cookies()).get(ACTIVE_LEAGUE_COOKIE)?.value;
  if (process.env.CALLUPS_API_ENABLED !== "true" || !leagueId || leagueId !== selectedLeagueId) {
    return Response.json({ message: "Lista indisponível." }, { status: 404, headers });
  }

  try {
    const api = await callupApiFor(await createClient());
    if (!api) return Response.json({ message: "Sessão necessária." }, { status: 401, headers });
    const callups = await api.listActive(leagueId);
    return Response.json(callups.map(({ id, updated_at, entries }) => ({ id, updated_at, entries })), { headers });
  } catch (error) {
    const status = error instanceof ApiError ? error.statusCode ?? 502 : 502;
    return Response.json({ message: "Não foi possível atualizar a lista." }, { status, headers });
  }
}
