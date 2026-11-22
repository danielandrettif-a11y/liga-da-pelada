import type { Actor } from "../../../shared/actor.js";
import { parseLeagueId } from "../domain/league.js";

export interface LeagueLobbyRepository {
  joinOpen(leagueId: string, actor: Actor): Promise<boolean>;
  setFavorite(leagueId: string, favorite: boolean, actor: Actor): Promise<boolean>;
  requestByInvite(inviteToken: string, actor: Actor): Promise<string>;
}

export async function joinOpenLeague(leagueId: string, actor: Actor, repository: LeagueLobbyRepository) {
  return { joined: await repository.joinOpen(parseLeagueId(leagueId), actor) };
}

export async function setLeagueFavorite(
  leagueId: string,
  favorite: boolean,
  actor: Actor,
  repository: LeagueLobbyRepository,
) {
  return { favorite: await repository.setFavorite(parseLeagueId(leagueId), favorite, actor) };
}

export async function requestLeagueMembershipByInvite(
  inviteToken: string,
  actor: Actor,
  repository: LeagueLobbyRepository,
) {
  return { league_id: await repository.requestByInvite(parseLeagueId(inviteToken), actor) };
}
