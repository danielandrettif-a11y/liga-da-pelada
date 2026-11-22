import type { Actor } from "../../../shared/actor.js";
import { parseNewLeague, type NewLeague } from "../domain/league.js";

export interface LeagueRepository {
  /** A RPC cria pelada, temporada, membro e regras de ranking atomicamente. */
  create(league: NewLeague, actor: Actor): Promise<string>;
}

export async function createLeague(
  input: { name: string; tier: string; visibility: string },
  actor: Actor,
  repository: LeagueRepository,
): Promise<{ league_id: string }> {
  const league = parseNewLeague(input);
  return { league_id: await repository.create(league, actor) };
}
