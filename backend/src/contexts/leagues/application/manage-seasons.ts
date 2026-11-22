import type { Actor } from "../../../shared/actor.js";
import { parseLeagueId } from "../domain/league.js";
import {
  assertFinishConfirmation,
  parseRoundType,
  type RoundType,
  type Season,
  type SeasonSummary,
} from "../domain/season.js";

export interface SeasonRepository {
  getActive(leagueId: string, actor: Actor): Promise<Season | null>;
  getActiveRoundIds(leagueId: string, roundType: RoundType, actor: Actor): Promise<string[]>;
  getLatestFinishedSummary(leagueId: string, actor: Actor): Promise<SeasonSummary | null>;
  finish(leagueId: string, actor: Actor, endedAt: string): Promise<{
    summary: SeasonSummary;
    newSeasonNumber: number;
  }>;
}

export async function getActiveSeason(leagueId: string, actor: Actor, repository: SeasonRepository) {
  return repository.getActive(parseLeagueId(leagueId), actor);
}

export async function getActiveSeasonRoundIds(
  leagueId: string,
  roundType: string,
  actor: Actor,
  repository: SeasonRepository,
) {
  return repository.getActiveRoundIds(parseLeagueId(leagueId), parseRoundType(roundType), actor);
}

export async function getLatestFinishedSeason(leagueId: string, actor: Actor, repository: SeasonRepository) {
  return repository.getLatestFinishedSummary(parseLeagueId(leagueId), actor);
}

export async function finishSeason(
  leagueId: string,
  confirmation: string,
  actor: Actor,
  repository: SeasonRepository,
  now: () => Date = () => new Date(),
) {
  assertFinishConfirmation(confirmation);
  return repository.finish(parseLeagueId(leagueId), actor, now().toISOString());
}
