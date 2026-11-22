import type { Actor } from "../../../shared/actor.js";
import { parsePlayerCatalogUuid } from "../domain/player-catalog.js";
import {
  achievementBeltsFromJson,
  monthlyAwardsFromRows,
  monthlyAwardWinnersFromRows,
  parseAwardPeriod,
  type MonthlyAward,
  type MonthlyAwardWinner,
  type PlayerAchievementBelt,
} from "../domain/player-awards.js";

export interface PlayerAwardsRepository {
  listMonthlyAwards(leagueId: string, playerId: string, actor: Actor): Promise<unknown>;
  listAchievementBelts(leagueId: string, playerId: string, actor: Actor): Promise<unknown>;
  listMonthlyAwardWinners(leagueId: string, periodStart: string, actor: Actor): Promise<unknown>;
}

function ids(leagueId: string, playerId: string): [string, string] {
  return [parsePlayerCatalogUuid(leagueId, "Pelada"), parsePlayerCatalogUuid(playerId, "Jogador")];
}

export async function getPlayerMonthlyAwards(
  leagueId: string, playerId: string, actor: Actor, repository: PlayerAwardsRepository,
): Promise<MonthlyAward[]> {
  const [league, player] = ids(leagueId, playerId);
  return monthlyAwardsFromRows(await repository.listMonthlyAwards(league, player, actor));
}

export async function getPlayerAchievementBelts(
  leagueId: string, playerId: string, actor: Actor, repository: PlayerAwardsRepository,
): Promise<PlayerAchievementBelt[]> {
  const [league, player] = ids(leagueId, playerId);
  return achievementBeltsFromJson(await repository.listAchievementBelts(league, player, actor));
}

export async function getMonthlyAwardWinners(
  leagueId: string, periodStart: string, actor: Actor, repository: PlayerAwardsRepository,
): Promise<MonthlyAwardWinner[]> {
  const league = parsePlayerCatalogUuid(leagueId, "Pelada");
  return monthlyAwardWinnersFromRows(
    await repository.listMonthlyAwardWinners(league, parseAwardPeriod(periodStart), actor),
  );
}
