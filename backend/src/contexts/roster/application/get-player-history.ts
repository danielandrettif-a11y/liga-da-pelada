import type { Actor } from "../../../shared/actor.js";
import { parsePlayerCatalogUuid } from "../domain/player-catalog.js";
import {
  buildPlayerAwardSeasons,
  buildPlayerRoundHistory,
  type AwardRound,
  type AwardStat,
  type PlayerAwardSeason,
  type PlayerHistoryRoundType,
  type PlayerRoundHistory,
  type PlayerRoundHistorySource,
} from "../domain/player-history.js";

export interface PlayerHistoryRepository {
  listRoundHistory(
    leagueId: string, playerId: string, roundType: PlayerHistoryRoundType, actor: Actor,
  ): Promise<PlayerRoundHistorySource[]>;
  readAwardHistory(leagueId: string, actor: Actor): Promise<{ rounds: AwardRound[]; stats: AwardStat[] }>;
}

function roundType(value: string): PlayerHistoryRoundType {
  if (value !== "official" && value !== "friendly") throw new Error("Tipo de rodada inválido.");
  return value;
}

export async function getPlayerRoundHistory(
  leagueId: string, playerId: string, requestedRoundType: string, actor: Actor, repository: PlayerHistoryRepository,
): Promise<PlayerRoundHistory[]> {
  const league = parsePlayerCatalogUuid(leagueId, "Pelada");
  const player = parsePlayerCatalogUuid(playerId, "Jogador");
  const resolvedType = roundType(requestedRoundType);
  return buildPlayerRoundHistory(await repository.listRoundHistory(league, player, resolvedType, actor), resolvedType);
}

export async function getPlayerAwardSeasons(
  leagueId: string, playerId: string, actor: Actor, repository: PlayerHistoryRepository,
): Promise<PlayerAwardSeason[]> {
  const league = parsePlayerCatalogUuid(leagueId, "Pelada");
  const player = parsePlayerCatalogUuid(playerId, "Jogador");
  const history = await repository.readAwardHistory(league, actor);
  return buildPlayerAwardSeasons(player, history.rounds, history.stats);
}
