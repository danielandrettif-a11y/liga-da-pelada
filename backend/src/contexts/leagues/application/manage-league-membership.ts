import type { Actor } from "../../../shared/actor.js";
import { parseLeagueId } from "../domain/league.js";

export interface LeagueLobbyRepository {
  joinOpen(leagueId: string, actor: Actor): Promise<boolean>;
  toggleFavorite(leagueId: string, actor: Actor): Promise<boolean>;
  requestByInvite(inviteToken: string, actor: Actor): Promise<string>;
}

export async function joinOpenLeague(leagueId: string, actor: Actor, repository: LeagueLobbyRepository) {
  return { joined: await repository.joinOpen(parseLeagueId(leagueId), actor) };
}

export async function toggleLeagueFavorite(leagueId: string, actor: Actor, repository: LeagueLobbyRepository) {
  return { favorite: await repository.toggleFavorite(parseLeagueId(leagueId), actor) };
}

export async function requestLeagueMembershipByInvite(
  inviteToken: string,
  actor: Actor,
  repository: LeagueLobbyRepository,
) {
  return { league_id: await repository.requestByInvite(parseLeagueId(inviteToken), actor) };
}
