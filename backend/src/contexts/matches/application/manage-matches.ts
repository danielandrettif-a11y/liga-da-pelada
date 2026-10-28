import type { Actor } from "../../../shared/actor.js";
import {
  parseMatchUuid,
  validateExtraSeconds,
  validateGoalCorrectionConfirmation,
  validateTimerAction,
  validateTimerThreshold,
  type MatchTimerAction,
  type MatchTimerThreshold,
} from "../domain/match.js";

export type MatchDetails = {
  id: string;
  round_id: string;
  team_a_id: string;
  team_b_id: string;
  score_a: number;
  score_b: number;
  status: string;
  match_order: number;
  started_at: string | null;
  finished_at: string | null;
  timer_started_at: string | null;
  timer_accumulated_seconds: number;
  duration_seconds: number;
  eligibility_elapsed_offset_seconds: number;
  created_at: string;
  team_a?: any;
  team_b?: any;
  match_players?: any[];
  match_events?: any[];
  match_goalkeeper_stints?: any[];
  match_substitutions?: any[];
  round?: any;
  player_cosmetics?: Record<string, { bannerAssetKey: string | null; frameKey: string | null; auraKey: string | null }>;
};

export type MatchAdminAuditEntry = {
  id: number;
  action: string;
  changedByName: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type CreateMatchInput = {
  round_id: string;
  team_a_id: string;
  team_b_id: string;
  goalkeeper_a_id: string;
  goalkeeper_b_id: string;
  idempotency_key?: string;
  client_started_at?: string;
  replacements?: Array<{
    team_id: string;
    absent_player_id: string;
    replacement_player_id: string;
  }>;
  structural_loan_overrides?: Array<{
    target_team_id: string;
    rotation_order: number;
    player_id: string;
  }>;
  structural_loan_excluded_player_ids?: string[];
};

export type SubstituteMatchPlayerInput = {
  match_id: string;
  team_id: string;
  player_out_id: string;
  player_in_id: string;
  minute?: number;
  elapsed_seconds?: number;
};

export interface MatchRepository {
  getMatch(matchId: string, leagueId: string, actor: Actor): Promise<MatchDetails | null>;
  findLiveMatchForTeams(roundId: string, teamAId: string, teamBId: string, leagueId: string, actor: Actor): Promise<string | null>;
  getFinishedMatchAudit(matchId: string, leagueId: string, actor: Actor): Promise<MatchAdminAuditEntry[]>;
  createMatch(input: CreateMatchInput, leagueId: string, actor: Actor): Promise<{ matchId: string; idempotent: boolean; receipt?: any }>;
  finishMatch(matchId: string, leagueId: string, actor: Actor): Promise<{ roundId: string }>;
  deleteMatch(matchId: string, leagueId: string, actor: Actor): Promise<{ roundId: string }>;
  deleteEvent(eventId: string, matchId: string, leagueId: string, actor: Actor): Promise<{ roundId: string; scoreA: number; scoreB: number }>;
  correctFinishedGoal(eventId: string, confirmation: string, leagueId: string, actor: Actor): Promise<{ roundId: string; matchId: string; warning?: string }>;
  correctFinishedGoalEvent(eventId: string, playerId: string, assistPlayerId: string | null, confirmation: string, leagueId: string, actor: Actor): Promise<{ roundId: string; matchId: string; warning?: string }>;
  addFinishedGoalEvent(matchId: string, teamId: string, playerId: string, assistPlayerId: string | null, confirmation: string, leagueId: string, actor: Actor): Promise<{ roundId: string; matchId: string; warning?: string }>;
  changeMatchGoalkeeper(matchId: string, teamId: string, playerId: string, elapsedSeconds: number | undefined, leagueId: string, actor: Actor): Promise<{ roundId: string }>;
  setRoundTeamFixedGoalkeeper(roundId: string, teamId: string, playerId: string | null, leagueId: string, actor: Actor): Promise<{ roundId: string }>;
  substituteMatchPlayer(input: SubstituteMatchPlayerInput, leagueId: string, actor: Actor): Promise<{ roundId: string; substitutionId: string }>;
  undoLastMatchSubstitution(substitutionId: string, matchId: string, leagueId: string, actor: Actor): Promise<{ roundId: string }>;
  updateMatchTimer(matchId: string, action: MatchTimerAction, leagueId: string, actor: Actor): Promise<{ timerStartedAt?: string | null; timerAccumulatedSeconds?: number }>;
  resetMatchTimer(matchId: string, leagueId: string, actor: Actor): Promise<{ eligibilityOffset: number }>;
  addMatchExtraTime(matchId: string, extraSeconds: number, leagueId: string, actor: Actor): Promise<{ newDuration: number }>;
  notifyMatchTimerThreshold(matchId: string, threshold: MatchTimerThreshold, leagueId: string, actor: Actor): Promise<{ sent?: boolean; skipped?: boolean; reason?: string }>;
  dispatchMatchTimerThreshold(matchId: string, threshold: MatchTimerThreshold, leagueId: string, actor: Actor): Promise<{ sent?: boolean; skipped?: boolean; reason?: string }>;
}

export function getMatch(matchId: string, leagueId: string, actor: Actor, repository: MatchRepository): Promise<MatchDetails | null> {
  return repository.getMatch(parseMatchUuid(matchId, "Partida"), parseMatchUuid(leagueId, "Pelada"), actor);
}

export function findLiveMatchForTeams(roundId: string, teamAId: string, teamBId: string, leagueId: string, actor: Actor, repository: MatchRepository): Promise<string | null> {
  return repository.findLiveMatchForTeams(
    parseMatchUuid(roundId, "Rodada"),
    parseMatchUuid(teamAId, "Time A"),
    parseMatchUuid(teamBId, "Time B"),
    parseMatchUuid(leagueId, "Pelada"),
    actor,
  );
}

export function getFinishedMatchAudit(matchId: string, leagueId: string, actor: Actor, repository: MatchRepository): Promise<MatchAdminAuditEntry[]> {
  return repository.getFinishedMatchAudit(parseMatchUuid(matchId, "Partida"), parseMatchUuid(leagueId, "Pelada"), actor);
}

export function createMatch(input: CreateMatchInput, leagueId: string, actor: Actor, repository: MatchRepository) {
  parseMatchUuid(input.round_id, "Rodada");
  parseMatchUuid(input.team_a_id, "Time A");
  parseMatchUuid(input.team_b_id, "Time B");
  parseMatchUuid(input.goalkeeper_a_id, "Goleiro A");
  parseMatchUuid(input.goalkeeper_b_id, "Goleiro B");
  return repository.createMatch(input, parseMatchUuid(leagueId, "Pelada"), actor);
}

export function finishMatch(matchId: string, leagueId: string, actor: Actor, repository: MatchRepository) {
  return repository.finishMatch(parseMatchUuid(matchId, "Partida"), parseMatchUuid(leagueId, "Pelada"), actor);
}

export function deleteMatch(matchId: string, leagueId: string, actor: Actor, repository: MatchRepository) {
  return repository.deleteMatch(parseMatchUuid(matchId, "Partida"), parseMatchUuid(leagueId, "Pelada"), actor);
}

export function deleteEvent(eventId: string, matchId: string, leagueId: string, actor: Actor, repository: MatchRepository) {
  return repository.deleteEvent(parseMatchUuid(eventId, "Evento"), parseMatchUuid(matchId, "Partida"), parseMatchUuid(leagueId, "Pelada"), actor);
}

export function correctFinishedGoal(eventId: string, confirmation: string, leagueId: string, actor: Actor, repository: MatchRepository) {
  validateGoalCorrectionConfirmation(confirmation);
  return repository.correctFinishedGoal(parseMatchUuid(eventId, "Evento"), confirmation, parseMatchUuid(leagueId, "Pelada"), actor);
}

export function correctFinishedGoalEvent(eventId: string, playerId: string, assistPlayerId: string | null, confirmation: string, leagueId: string, actor: Actor, repository: MatchRepository) {
  validateGoalCorrectionConfirmation(confirmation);
  return repository.correctFinishedGoalEvent(
    parseMatchUuid(eventId, "Evento"),
    parseMatchUuid(playerId, "Jogador"),
    assistPlayerId ? parseMatchUuid(assistPlayerId, "Assistência") : null,
    confirmation,
    parseMatchUuid(leagueId, "Pelada"),
    actor,
  );
}

export function addFinishedGoalEvent(matchId: string, teamId: string, playerId: string, assistPlayerId: string | null, confirmation: string, leagueId: string, actor: Actor, repository: MatchRepository) {
  validateGoalCorrectionConfirmation(confirmation);
  return repository.addFinishedGoalEvent(
    parseMatchUuid(matchId, "Partida"),
    parseMatchUuid(teamId, "Time"),
    parseMatchUuid(playerId, "Jogador"),
    assistPlayerId ? parseMatchUuid(assistPlayerId, "Assistência") : null,
    confirmation,
    parseMatchUuid(leagueId, "Pelada"),
    actor,
  );
}

export function changeMatchGoalkeeper(matchId: string, teamId: string, playerId: string, elapsedSeconds: number | undefined, leagueId: string, actor: Actor, repository: MatchRepository) {
  return repository.changeMatchGoalkeeper(
    parseMatchUuid(matchId, "Partida"),
    parseMatchUuid(teamId, "Time"),
    parseMatchUuid(playerId, "Goleiro"),
    elapsedSeconds,
    parseMatchUuid(leagueId, "Pelada"),
    actor,
  );
}

export function setRoundTeamFixedGoalkeeper(roundId: string, teamId: string, playerId: string | null, leagueId: string, actor: Actor, repository: MatchRepository) {
  return repository.setRoundTeamFixedGoalkeeper(
    parseMatchUuid(roundId, "Rodada"),
    parseMatchUuid(teamId, "Time"),
    playerId ? parseMatchUuid(playerId, "Goleiro Fixo") : null,
    parseMatchUuid(leagueId, "Pelada"),
    actor,
  );
}

export function substituteMatchPlayer(input: SubstituteMatchPlayerInput, leagueId: string, actor: Actor, repository: MatchRepository) {
  return repository.substituteMatchPlayer(
    {
      ...input,
      match_id: parseMatchUuid(input.match_id, "Partida"),
      team_id: parseMatchUuid(input.team_id, "Time"),
      player_out_id: parseMatchUuid(input.player_out_id, "Jogador que sai"),
      player_in_id: parseMatchUuid(input.player_in_id, "Jogador que entra"),
    },
    parseMatchUuid(leagueId, "Pelada"),
    actor,
  );
}

export function undoLastMatchSubstitution(substitutionId: string, matchId: string, leagueId: string, actor: Actor, repository: MatchRepository) {
  return repository.undoLastMatchSubstitution(
    parseMatchUuid(substitutionId, "Substituição"),
    parseMatchUuid(matchId, "Partida"),
    parseMatchUuid(leagueId, "Pelada"),
    actor,
  );
}

export function updateMatchTimer(matchId: string, action: string, leagueId: string, actor: Actor, repository: MatchRepository) {
  const validatedAction = validateTimerAction(action);
  return repository.updateMatchTimer(parseMatchUuid(matchId, "Partida"), validatedAction, parseMatchUuid(leagueId, "Pelada"), actor);
}

export function resetMatchTimer(matchId: string, leagueId: string, actor: Actor, repository: MatchRepository) {
  return repository.resetMatchTimer(parseMatchUuid(matchId, "Partida"), parseMatchUuid(leagueId, "Pelada"), actor);
}

export function addMatchExtraTime(matchId: string, extraSeconds: number, leagueId: string, actor: Actor, repository: MatchRepository) {
  const validatedSeconds = validateExtraSeconds(extraSeconds);
  return repository.addMatchExtraTime(parseMatchUuid(matchId, "Partida"), validatedSeconds, parseMatchUuid(leagueId, "Pelada"), actor);
}

export function notifyMatchTimerThreshold(matchId: string, threshold: string, leagueId: string, actor: Actor, repository: MatchRepository) {
  const validatedThreshold = validateTimerThreshold(threshold);
  return repository.notifyMatchTimerThreshold(parseMatchUuid(matchId, "Partida"), validatedThreshold, parseMatchUuid(leagueId, "Pelada"), actor);
}

export function dispatchMatchTimerThreshold(matchId: string, threshold: string, leagueId: string, actor: Actor, repository: MatchRepository) {
  const validatedThreshold = validateTimerThreshold(threshold);
  return repository.dispatchMatchTimerThreshold(parseMatchUuid(matchId, "Partida"), validatedThreshold, parseMatchUuid(leagueId, "Pelada"), actor);
}

export function selectBestGoalkeeper(_roundId: string, _playerId: string) {
  return {
    success: false,
    error: "O prêmio de melhor goleiro foi removido. A pontuação agora vem das atuações reais no gol.",
  };
}
