import type { Actor } from "../../../shared/actor.js";
import type { PlayerCatalogRepository } from "./get-player-catalog.js";
import { orderedPlayers, parsePlayerCatalogUuid } from "../domain/player-catalog.js";
import {
  buildRosterPlayerStatistics,
  groupRosterPlayers,
  parseRosterRoundType,
  type PlayerOverallRecord,
  type PlayerSeasonTotalsRecord,
  type RosterGroups,
  type RosterPlayerStatistics,
  type RosterRoundType,
} from "../domain/player-statistics.js";

export interface PlayerStatisticsRepository {
  listSeasonTotals(
    leagueId: string, roundType: RosterRoundType, actor: Actor,
  ): Promise<PlayerSeasonTotalsRecord[]>;
  listLatestOveralls(leagueId: string, actor: Actor): Promise<PlayerOverallRecord[]>;
}

export async function getPlayersWithStats(
  leagueId: string,
  roundType: string,
  selectableOnly: boolean,
  actor: Actor,
  catalog: PlayerCatalogRepository,
  statistics: PlayerStatisticsRepository,
): Promise<RosterPlayerStatistics[]> {
  const parsedLeagueId = parsePlayerCatalogUuid(leagueId, "Pelada");
  const parsedRoundType = parseRosterRoundType(roundType);
  const [records, totals] = await Promise.all([
    catalog.list(parsedLeagueId, actor),
    statistics.listSeasonTotals(parsedLeagueId, parsedRoundType, actor),
  ]);
  return buildRosterPlayerStatistics(orderedPlayers(records, selectableOnly), totals, parsedRoundType);
}

export async function getRosterGroups(
  leagueId: string,
  roundType: string,
  actor: Actor,
  catalog: PlayerCatalogRepository,
  statistics: PlayerStatisticsRepository,
): Promise<RosterGroups> {
  const parsedLeagueId = parsePlayerCatalogUuid(leagueId, "Pelada");
  const parsedRoundType = parseRosterRoundType(roundType);
  const [records, totals, overalls] = await Promise.all([
    catalog.list(parsedLeagueId, actor),
    statistics.listSeasonTotals(parsedLeagueId, parsedRoundType, actor),
    parsedRoundType === "official" ? statistics.listLatestOveralls(parsedLeagueId, actor) : Promise.resolve([]),
  ]);
  const players = buildRosterPlayerStatistics(orderedPlayers(records, false), totals, parsedRoundType);
  return groupRosterPlayers(players, overalls);
}
