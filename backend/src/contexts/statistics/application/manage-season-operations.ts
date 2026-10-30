import type { Actor } from "../../../shared/actor.js";
import type {
  PlayerCardOverallMap,
  ReprocessExecutionResult,
  ReprocessPreviewResult,
  SeasonTeamStanding,
} from "../domain/season-operations.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class SeasonOperationsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeasonOperationsValidationError";
  }
}

function leagueId(value: string) {
  const normalized = String(value || "").trim();
  if (!UUID.test(normalized)) throw new SeasonOperationsValidationError("Pelada inválida.");
  return normalized;
}

export interface SeasonOperationsRepository {
  findPlayerCardOveralls(actor: Actor, leagueId: string): Promise<PlayerCardOverallMap>;
  findTeamStandings(actor: Actor, leagueId: string): Promise<SeasonTeamStanding[]>;
  previewReprocess(actor: Actor, leagueId: string): Promise<ReprocessPreviewResult>;
  executeReprocess(actor: Actor, leagueId: string): Promise<ReprocessExecutionResult>;
}

export class ManageSeasonOperationsUseCase {
  constructor(private readonly repository: SeasonOperationsRepository) {}

  getPlayerCardOveralls(actor: Actor, value: string) {
    return this.repository.findPlayerCardOveralls(actor, leagueId(value));
  }

  getTeamStandings(actor: Actor, value: string) {
    return this.repository.findTeamStandings(actor, leagueId(value));
  }

  previewReprocessSeason(actor: Actor, value: string) {
    return this.repository.previewReprocess(actor, leagueId(value));
  }

  executeReprocessSeason(actor: Actor, value: string) {
    return this.repository.executeReprocess(actor, leagueId(value));
  }
}
