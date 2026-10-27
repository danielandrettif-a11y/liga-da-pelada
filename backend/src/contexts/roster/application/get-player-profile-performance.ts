import type { Actor } from "../../../shared/actor.js";
import { parsePlayerCatalogUuid } from "../domain/player-catalog.js";
import {
  goalsByClub,
  totalPlayerPlaytime,
  type ClubGoalEvent,
  type MatchParticipation,
  type PlayerClubGoals,
  type PlayerPlaytime,
} from "../domain/player-profile-performance.js";

export interface PlayerProfilePerformanceRepository {
  listParticipations(leagueId: string, playerId: string, actor: Actor): Promise<MatchParticipation[]>;
  listGoalEvents(leagueId: string, playerId: string, actor: Actor): Promise<ClubGoalEvent[]>;
}

export async function getPlayerPlaytime(
  leagueId: string,
  playerId: string,
  actor: Actor,
  repository: PlayerProfilePerformanceRepository,
  now: Date = new Date(),
): Promise<PlayerPlaytime> {
  const rows = await repository.listParticipations(
    parsePlayerCatalogUuid(leagueId, "Pelada"), parsePlayerCatalogUuid(playerId, "Jogador"), actor,
  );
  return totalPlayerPlaytime(rows, now);
}

export async function getPlayerGoalsByClub(
  leagueId: string,
  playerId: string,
  actor: Actor,
  repository: PlayerProfilePerformanceRepository,
): Promise<PlayerClubGoals[]> {
  const events = await repository.listGoalEvents(
    parsePlayerCatalogUuid(leagueId, "Pelada"), parsePlayerCatalogUuid(playerId, "Jogador"), actor,
  );
  return goalsByClub(events);
}
