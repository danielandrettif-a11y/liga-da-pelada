import type { Actor } from "../../../shared/actor.js";
import {
  MatchValidationError,
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

export type FinishedMatchSummary = {
  id: string;
  round_id: string;
  score_a: number;
  score_b: number;
  team_a: { name: string } | null;
  team_b: { name: string } | null;
};

export type MatchTimerState = {
  status: string;
  durationSeconds: number;
  accumulatedSeconds: number;
  startedAt: string | null;
};

export type MatchTimerNotificationClaim = {
  skipped?: boolean;
  reason?: "inactive" | "too_early" | "already_alerted";
  secondsLeft?: number;
  claimedAt?: string;
  match?: FinishedMatchSummary;
};

export interface MatchTimerScheduler {
  schedule(input: {
    matchId: string;
    durationSeconds: number;
    accumulatedSeconds: number;
    startedAt: string;
  }): Promise<void>;
}

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
  player_in_id?: string;
  reason: "tired" | "injury" | "other";
  mark_injured?: boolean;
};

export interface MatchRepository {
  getMatch(matchId: string, leagueId: string, actor: Actor): Promise<MatchDetails | null>;
  findLiveMatchForTeams(roundId: string, teamAId: string, teamBId: string, leagueId: string, actor: Actor): Promise<string | null>;
  getFinishedMatchAudit(matchId: string, leagueId: string, actor: Actor): Promise<MatchAdminAuditEntry[]>;
  createMatch(input: CreateMatchInput, leagueId: string, actor: Actor): Promise<{ matchId: string; idempotent: boolean; receipt?: any }>;
  finishMatch(matchId: string, leagueId: string, actor: Actor): Promise<{
    roundId: string;
    alreadyFinished?: boolean;
    match: FinishedMatchSummary;
  }>;
  deleteMatch(matchId: string, leagueId: string, actor: Actor): Promise<{ roundId: string }>;
  deleteEvent(eventId: string, matchId: string, leagueId: string, actor: Actor): Promise<{ roundId: string; scoreA: number; scoreB: number }>;
  correctFinishedGoal(eventId: string, confirmation: string, leagueId: string, actor: Actor): Promise<{ roundId: string; matchId: string; warning?: string }>;
  correctFinishedGoalEvent(eventId: string, playerId: string, assistPlayerId: string | null, confirmation: string, leagueId: string, actor: Actor): Promise<{ roundId: string; matchId: string; warning?: string }>;
  addFinishedGoalEvent(matchId: string, teamId: string, playerId: string, assistPlayerId: string | null, confirmation: string, leagueId: string, actor: Actor): Promise<{ roundId: string; matchId: string; warning?: string }>;
  changeMatchGoalkeeper(matchId: string, teamId: string, playerId: string, elapsedSeconds: number | undefined, leagueId: string, actor: Actor): Promise<{ roundId: string }>;
  setRoundTeamFixedGoalkeeper(roundId: string, teamId: string, playerId: string | null, leagueId: string, actor: Actor): Promise<{ roundId: string }>;
  substituteMatchPlayer(input: SubstituteMatchPlayerInput, leagueId: string, actor: Actor): Promise<{ roundId: string; substitutionId: string }>;
  undoLastMatchSubstitution(substitutionId: string, matchId: string, leagueId: string, actor: Actor): Promise<{ roundId: string }>;
  getMatchTimerState(matchId: string, leagueId: string, actor: Actor): Promise<MatchTimerState>;
  updateMatchTimer(matchId: string, action: MatchTimerAction, startedAt: string | null, leagueId: string, actor: Actor): Promise<{ timerStartedAt?: string | null; timerAccumulatedSeconds?: number }>;
  resetMatchTimer(matchId: string, leagueId: string, actor: Actor): Promise<{ eligibilityOffset: number }>;
  setMatchDuration(matchId: string, durationSeconds: number, leagueId: string, actor: Actor): Promise<{ newDuration: number }>;
  notifyMatchTimerThreshold(matchId: string, threshold: MatchTimerThreshold, leagueId: string, actor: Actor): Promise<MatchTimerNotificationClaim>;
  releaseMatchTimerThreshold(matchId: string, threshold: MatchTimerThreshold, claimedAt: string, leagueId: string, actor: Actor): Promise<void>;
  dispatchMatchTimerThresholdSystem(matchId: string, threshold: MatchTimerThreshold): Promise<MatchTimerNotificationClaim>;
  releaseMatchTimerThresholdSystem(matchId: string, threshold: MatchTimerThreshold, claimedAt: string): Promise<void>;
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
  if (!input) throw new MatchValidationError("Informe os dados da partida.");
  const normalized: CreateMatchInput = {
    ...input,
    round_id: parseMatchUuid(input.round_id, "Rodada"),
    team_a_id: parseMatchUuid(input.team_a_id, "Time A"),
    team_b_id: parseMatchUuid(input.team_b_id, "Time B"),
    goalkeeper_a_id: parseMatchUuid(input.goalkeeper_a_id, "Goleiro A"),
    goalkeeper_b_id: parseMatchUuid(input.goalkeeper_b_id, "Goleiro B"),
    replacements: (input.replacements || []).map((entry) => ({
      team_id: parseMatchUuid(entry.team_id, "Time do empréstimo"),
      absent_player_id: parseMatchUuid(entry.absent_player_id, "Jogador ausente"),
      replacement_player_id: parseMatchUuid(entry.replacement_player_id, "Substituto"),
    })),
    structural_loan_overrides: (input.structural_loan_overrides || []).map((entry) => ({
      target_team_id: parseMatchUuid(entry.target_team_id, "Time do empréstimo estrutural"),
      rotation_order: entry.rotation_order,
      player_id: parseMatchUuid(entry.player_id, "Jogador emprestado"),
    })),
    structural_loan_excluded_player_ids: (input.structural_loan_excluded_player_ids || [])
      .map((id) => parseMatchUuid(id, "Jogador que recusou o empréstimo")),
  };
  if (normalized.team_a_id === normalized.team_b_id) throw new MatchValidationError("Selecione dois times diferentes.");
  if (normalized.goalkeeper_a_id === normalized.goalkeeper_b_id) throw new MatchValidationError("Escolha um goleiro diferente para cada time.");
  if ((normalized.replacements?.length || 0) > 30) throw new MatchValidationError("Quantidade de substitutos inválida.");
  if ((normalized.structural_loan_overrides?.length || 0) > 12
    || (normalized.structural_loan_excluded_player_ids?.length || 0) > 30) {
    throw new MatchValidationError("Quantidade de trocas de empréstimo inválida.");
  }
  if (normalized.client_started_at && !Number.isFinite(Date.parse(normalized.client_started_at))) {
    throw new MatchValidationError("Horário de início inválido.");
  }
  return repository.createMatch(normalized, parseMatchUuid(leagueId, "Pelada"), actor);
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
  const normalizedElapsed = Number.isFinite(elapsedSeconds)
    ? Math.max(0, Math.floor(elapsedSeconds!))
    : undefined;
  return repository.changeMatchGoalkeeper(
    parseMatchUuid(matchId, "Partida"),
    parseMatchUuid(teamId, "Time"),
    parseMatchUuid(playerId, "Goleiro"),
    normalizedElapsed,
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
  if (!input || !["tired", "injury", "other"].includes(input.reason)) {
    throw new MatchValidationError("Motivo de substituição inválido.");
  }
  const outgoingId = parseMatchUuid(input.player_out_id, "Jogador que sai");
  const incomingId = input.player_in_id ? parseMatchUuid(input.player_in_id, "Jogador que entra") : undefined;
  if (incomingId === outgoingId) throw new MatchValidationError("Escolha jogadores diferentes.");
  return repository.substituteMatchPlayer(
    {
      ...input,
      match_id: parseMatchUuid(input.match_id, "Partida"),
      team_id: parseMatchUuid(input.team_id, "Time"),
      player_out_id: outgoingId,
      player_in_id: incomingId,
      mark_injured: Boolean(input.mark_injured),
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

export async function updateMatchTimer(matchId: string, action: string, leagueId: string, actor: Actor, repository: MatchRepository, scheduler: MatchTimerScheduler) {
  const validatedAction = validateTimerAction(action);
  const validatedMatchId = parseMatchUuid(matchId, "Partida");
  const validatedLeagueId = parseMatchUuid(leagueId, "Pelada");
  let startedAt: string | null = null;
  if (validatedAction === "start") {
    const state = await repository.getMatchTimerState(validatedMatchId, validatedLeagueId, actor);
    startedAt = new Date().toISOString();
    await scheduler.schedule({
      matchId: validatedMatchId,
      durationSeconds: state.durationSeconds,
      accumulatedSeconds: state.accumulatedSeconds,
      startedAt,
    });
  }
  return repository.updateMatchTimer(validatedMatchId, validatedAction, startedAt, validatedLeagueId, actor);
}

export function resetMatchTimer(matchId: string, leagueId: string, actor: Actor, repository: MatchRepository) {
  return repository.resetMatchTimer(parseMatchUuid(matchId, "Partida"), parseMatchUuid(leagueId, "Pelada"), actor);
}

export async function addMatchExtraTime(matchId: string, extraSeconds: number, leagueId: string, actor: Actor, repository: MatchRepository, scheduler: MatchTimerScheduler) {
  const validatedSeconds = validateExtraSeconds(extraSeconds);
  const validatedMatchId = parseMatchUuid(matchId, "Partida");
  const validatedLeagueId = parseMatchUuid(leagueId, "Pelada");
  const state = await repository.getMatchTimerState(validatedMatchId, validatedLeagueId, actor);
  const newDuration = Math.max(60, state.durationSeconds + validatedSeconds);
  if (state.startedAt) {
    await scheduler.schedule({
      matchId: validatedMatchId,
      durationSeconds: newDuration,
      accumulatedSeconds: state.accumulatedSeconds,
      startedAt: state.startedAt,
    });
  }
  return repository.setMatchDuration(validatedMatchId, newDuration, validatedLeagueId, actor);
}

export function notifyMatchTimerThreshold(matchId: string, threshold: string, leagueId: string, actor: Actor, repository: MatchRepository) {
  const validatedThreshold = validateTimerThreshold(threshold);
  return repository.notifyMatchTimerThreshold(parseMatchUuid(matchId, "Partida"), validatedThreshold, parseMatchUuid(leagueId, "Pelada"), actor);
}

export function dispatchMatchTimerThreshold(matchId: string, threshold: string, leagueId: string, actor: Actor, repository: MatchRepository) {
  const validatedThreshold = validateTimerThreshold(threshold);
  return repository.notifyMatchTimerThreshold(
    parseMatchUuid(matchId, "Partida"),
    validatedThreshold,
    parseMatchUuid(leagueId, "Pelada"),
    actor,
  );
}

export function selectBestGoalkeeper(_roundId: string, _playerId: string) {
  return {
    success: false,
    error: "O prêmio de melhor goleiro foi removido. A pontuação agora vem das atuações reais no gol.",
  };
}
