import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Read model enxuto da tela de criação de partida.
 *
 * Essa tela não precisa dos eventos, placares ou perfis completos carregados
 * pelo detalhe da rodada. Manter a projeção aqui explícita evita que novos
 * campos pesados entrem no caminho crítico por acidente.
 */
export const MATCH_SETUP_ROUND_SELECT = `
  id,
  league_id,
  number,
  target_players_per_team,
  formation_mode,
  arrival_order_enabled,
  round_players (
    player_id,
    availability_status,
    attendance_status
  ),
  teams (
    id,
    name,
    position,
    color,
    crest_url,
    captain_player_id,
    fixed_goalkeeper_player_id,
    team_players (
      player_id,
      goalkeeper_order,
      loan_order,
      players (
        id,
        name,
        is_goalkeeper
      )
    )
  ),
  matches (
    id,
    team_a_id,
    team_b_id,
    match_order,
    started_at,
    created_at,
    match_players (
      player_id,
      team_id,
      original_team_id
    ),
    match_goalkeepers (
      player_id,
      team_id,
      rotation_order
    )
  ),
  league:league_id (
    players_per_team
  )
`;

export async function readMatchSetupRound(
  client: SupabaseClient,
  input: { roundId: string; leagueId: string },
) {
  const { data, error } = await client
    .from("rounds")
    .select(MATCH_SETUP_ROUND_SELECT)
    .eq("id", input.roundId)
    .eq("league_id", input.leagueId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const round = data as any;
  if (Array.isArray(round.teams)) {
    round.teams.sort((a: any, b: any) => Number(a.position || 0) - Number(b.position || 0));
  }

  return round;
}
