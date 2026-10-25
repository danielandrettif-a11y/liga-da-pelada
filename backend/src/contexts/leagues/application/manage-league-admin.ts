import type { Actor } from "../../../shared/actor.js";
import { parseLeagueId, parseLeagueVisibility } from "../domain/league.js";

export interface LeagueAdminRepository {
  reviewMembershipRequest(requestId: string, approve: boolean, actor: Actor): Promise<boolean>;
  addAccount(leagueId: string, userId: string, actor: Actor): Promise<boolean>;
  setVisibility(leagueId: string, visibility: "private" | "open", actor: Actor): Promise<boolean>;
}

export async function reviewLeagueMembership(
  requestId: string,
  approve: boolean,
  actor: Actor,
  repository: LeagueAdminRepository,
) {
  return { reviewed: await repository.reviewMembershipRequest(parseLeagueId(requestId), approve, actor) };
}

export async function addExistingAccountToLeague(
  leagueId: string,
  userId: string,
  actor: Actor,
  repository: LeagueAdminRepository,
) {
  return { added: await repository.addAccount(parseLeagueId(leagueId), parseLeagueId(userId), actor) };
}

export async function updateLeagueVisibility(
  leagueId: string,
  visibility: string,
  actor: Actor,
  repository: LeagueAdminRepository,
) {
  const parsedVisibility = parseLeagueVisibility(visibility);
  return { visibility: parsedVisibility, updated: await repository.setVisibility(
    parseLeagueId(leagueId), parsedVisibility, actor,
  ) };
}
