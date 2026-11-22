import type { Actor } from "../../../shared/actor.js";
import { parseLeagueId } from "../domain/league.js";

export interface LeagueMembershipRequestRepository {
  /** Retorna false quando a conta já pertence à pelada. */
  request(leagueId: string, actor: Actor): Promise<boolean>;
}

export async function requestLeagueMembership(
  leagueId: string,
  actor: Actor,
  repository: LeagueMembershipRequestRepository,
): Promise<{ requested: boolean }> {
  return { requested: await repository.request(parseLeagueId(leagueId), actor) };
}
