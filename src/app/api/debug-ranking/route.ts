import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getActiveLeague } from "@/lib/actions/rounds";
import { getActiveSeason } from "@/lib/actions/seasons";

// Rota de debug temporária para diagnosticar o ranking do Cartola.
// REMOVER após corrigir o problema.
export const dynamic = "force-dynamic";

export async function GET() {
  const log: Record<string, unknown> = {};

  try {
    const client = await createClient();
    const { data: { user } } = await client.auth.getUser();
    log.user = user ? { id: user.id, email: user.email } : null;

    if (!user) {
      return NextResponse.json({ error: "not_authenticated", log });
    }

    const league = await getActiveLeague();
    log.league = league;

    const season = await getActiveSeason(league?.id);
    log.season = season ? { id: season.id, status: (season as any).status } : null;

    if (!season) {
      return NextResponse.json({ error: "no_active_season", log });
    }

    const { data: fs, error: fsError } = await client
      .from("fantasy_seasons")
      .select("id")
      .eq("season_id", season.id)
      .maybeSingle();
    log.fantasy_season = fs;
    log.fantasy_season_error = fsError?.message || null;

    if (!fs) {
      return NextResponse.json({ error: "no_fantasy_season", log });
    }

    const serviceClient = createServiceClient();
    log.has_service_client = Boolean(serviceClient);
    const rankingClient = serviceClient || client;

    // Testa fantasy_accounts (scope general)
    const { data: accounts, error: accountsError } = await rankingClient
      .from("fantasy_accounts")
      .select("id, user_id, total_points, rounds_played, current_budget")
      .eq("fantasy_season_id", fs.id)
      .order("total_points", { ascending: false });
    log.accounts_count = accounts?.length ?? 0;
    log.accounts_error = accountsError?.message || null;
    log.accounts_sample = accounts?.slice(0, 3) ?? [];

    // Testa fantasy_rounds (scope round)
    const { data: rounds, error: roundsError } = await rankingClient
      .from("fantasy_rounds")
      .select("id, market_status, round_id, round:round_id(status, number)")
      .eq("fantasy_season_id", fs.id);
    log.rounds_count = rounds?.length ?? 0;
    log.rounds_error = roundsError?.message || null;
    log.rounds = rounds ?? [];

    // Testa fantasy_lineups para o primeiro round
    if (rounds && rounds.length > 0) {
      const targetRound = rounds.find((r: any) => r.market_status === "in_progress") || rounds[0];
      log.target_round = { id: targetRound.id, market_status: targetRound.market_status };

      const { data: lineups, error: lineupsError } = await rankingClient
        .from("fantasy_lineups")
        .select("id, user_id, status, total_points, fantasy_lineup_players(player_id)")
        .eq("fantasy_round_id", targetRound.id);
      log.lineups_total = lineups?.length ?? 0;
      log.lineups_error = lineupsError?.message || null;
      log.lineups_with_players = (lineups || []).filter(
        (l: any) => (l.fantasy_lineup_players || []).length > 0
      ).length;
      log.lineup_sample = lineups?.slice(0, 2).map((l: any) => ({
        id: l.id,
        status: l.status,
        players_count: (l.fantasy_lineup_players || []).length,
      }));
    }

    // Testa ignore_goalkeeper_stats na tabela rounds
    const { data: roundCheck, error: roundCheckError } = await rankingClient
      .from("rounds")
      .select("id, ignore_goalkeeper_stats")
      .limit(1);
    log.ignore_gk_column_exists = !roundCheckError;
    log.ignore_gk_error = roundCheckError?.message || null;

    // Testa account_profiles
    const { data: profiles, error: profilesError } = await rankingClient
      .from("account_profiles")
      .select("user_id, role")
      .limit(5);
    log.profiles_count = profiles?.length ?? 0;
    log.profiles_error = profilesError?.message || null;
    log.current_user_profile = profiles?.find((p: any) => p.user_id === user.id);

    return NextResponse.json({ ok: true, log });
  } catch (err: any) {
    return NextResponse.json({ error: "exception", message: err?.message, log });
  }
}
