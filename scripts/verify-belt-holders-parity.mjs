// Leitura apenas: compara o RPC em lote com a função individual após a migration 333.
// Uso: SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/verify-belt-holders-parity.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("Defina SUPABASE_URL e SUPABASE_SECRET_KEY no ambiente.");

const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  }
  return value;
}

const { data: leagues, error: leaguesError } = await client.from("leagues").select("id, name").eq("is_active", true);
if (leaguesError) throw leaguesError;
let mismatches = 0;
for (const [leagueIndex, league] of (leagues || []).entries()) {
  const { data: members, error: membersError } = await client.from("league_members")
    .select("player_id, players!inner(is_selectable, member_category)")
    .eq("league_id", league.id).eq("is_active", true);
  if (membersError) throw membersError;
  const officialIds = (members || []).filter((member) => {
    const player = Array.isArray(member.players) ? member.players[0] : member.players;
    return player?.is_selectable && player?.member_category === "player";
  }).map((member) => member.player_id);
  const startedAt = performance.now();
  const { data: batched, error: batchError } = await client.rpc("get_league_achievement_belt_holders", { p_league_id: league.id });
  if (batchError) throw batchError;
  const batchMs = Math.round(performance.now() - startedAt);
  const byPlayer = new Map((batched || []).map((row) => [row.player_id, row.belts]));
  for (const playerId of officialIds) {
    const { data: individual, error } = await client.rpc("get_player_achievement_belts", {
      p_player_id: playerId, p_league_id: league.id,
    });
    if (error) throw error;
    const expected = canonical(individual || []);
    const actual = canonical(byPlayer.get(playerId) || []);
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      mismatches++;
      // Não expõe nomes, IDs ou detalhes de scouts nos logs.
      console.error(`Diferença encontrada na pelada de índice ${leagueIndex + 1}, jogador de índice ${officialIds.indexOf(playerId) + 1}.`);
    }
  }
  console.info(JSON.stringify({ leagueIndex: leagueIndex + 1, officialPlayers: officialIds.length, batchMs, mismatches }));
}
if (mismatches) process.exitCode = 1;
