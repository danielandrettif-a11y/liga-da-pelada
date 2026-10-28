import type { Actor } from "../../../shared/actor.js";
import {
  InvalidRoundError,
  parseRoundUuid,
  validateRoundDate,
  validateRoundTime,
  validateRoundType,
  validateTeamSizes,
  type RoundDetail,
  type RoundMatchSetup,
  type RoundPlayerAttendance,
  type RoundPlayerAvailability,
  type RoundWithCounts,
} from "../domain/round.js";
import type { RoundReshuffleMode, RoundReshuffleSummary } from "../domain/round-team-shuffle.js";
import type { AdaptiveTeamSummary } from "../domain/adaptive-draw.js";
import type { DraftPlayerProfile, DraftSwapSuggestion, DraftTeamBalance } from "../domain/draft-balance.js";

export type AdminRoundPrelist = {
  id: string;
  league_id: string;
  season_id: string;
  number: number;
  date: string;
  start_time: string | null;
  status: string;
  round_type: string;
  preparation_stage: string;
  created_at: string;
  target_players_per_team: number | null;
  target_teams_per_round: number | null;
  stadium_id: string | null;
  stadium_name: string | null;
  stadium_map_url: string | null;
  playersCount: number;
  callupId: string | null;
  callupStatus: string | null;
  round_players: Array<{
    player_id: string;
    players: {
      id: string;
      name: string;
      nickname: string | null;
      avatar_url: string | null;
      player_profile: string | null;
      is_goalkeeper: boolean;
      member_category: string;
    };
  }>;
};

export type SaveRoundPrelistInput = {
  date: string;
  startTime: string;
  roundType: "friendly" | "official";
  playerIds: string[];
  callupId?: string | null;
  roundId?: string | null;
  stadiumId?: string | null;
  stadiumName?: string | null;
  stadiumMapUrl?: string | null;
};

export type SaveRoundPrelistResult = {
  roundId: string;
  effectiveDate: string;
  effectiveStartTime: string;
  effectiveRoundType: "friendly" | "official";
  created: boolean;
};

export type CreateRoundWithTeamsInput = {
  date: string;
  startTime?: string | null;
  roundType: "friendly" | "official";
  playersPerTeam: number;
  callupId?: string | null;
  prelistRoundId?: string | null;
  formationMode?: "manual" | "random" | "balanced" | "speed" | "adaptive";
  attendanceOrder?: string[];
  stadiumId?: string | null;
  stadiumName?: string | null;
  stadiumMapUrl?: string | null;
  confirmUnderfilled?: boolean;
  teams: Array<{
    name: string;
    color: string;
    crestUrl?: string | null;
    playerIds: string[];
    captainPlayerId?: string | null;
  }>;
};

export type FinishRoundInput = {
  paymentPix: string;
  paymentTotal: number;
  recipientId?: string | null;
  recipientName?: string | null;
  expenseItemIds?: string[];
};

export type FinishRoundResult = {
  archived: boolean;
  shouldRefreshOverall: boolean;
};

export type TeamFormationInput = {
  teams: Array<{
    teamId: string;
    playerIds: string[];
    captainPlayerId?: string | null;
  }>;
};

export type RoundTeamShuffleAssignment = { teamId: string; playerIds: string[] };

export type RoundTeamShufflePreview = {
  success: true;
  mode: RoundReshuffleMode;
  assignments: RoundTeamShuffleAssignment[];
  summaries: RoundReshuffleSummary[];
  balanceScore: number;
};

export type DraftWorkspace = {
  id: string;
  callupId: string | null;
  roundId: string;
  status: "setup" | "active" | "paused" | "completed" | "confirmed" | "cancelled";
  currentPick: number;
  pauseReason: string | null;
  isAdmin: boolean;
  currentPlayerId: string | null;
  captains: Array<{
    teamSlot: number;
    selectionOrder: number | null;
    winRate: number;
    officialRounds: number;
    player: {
      id: string;
      name: string;
      nickname: string | null;
      avatarUrl: string | null;
      profile: DraftPlayerProfile | null;
      overall: number | null;
      stars: number | null;
      teamSlot: number | null;
      isCaptain: boolean;
      pickNumber: number | null;
      active: boolean;
    };
  }>;
  players: Array<{
    id: string;
    name: string;
    nickname: string | null;
    avatarUrl: string | null;
    profile: DraftPlayerProfile | null;
    overall: number | null;
    stars: number | null;
    teamSlot: number | null;
    isCaptain: boolean;
    pickNumber: number | null;
    active: boolean;
  }>;
  summaries: DraftTeamBalance[];
  balanceScore: number;
  suggestion: (DraftSwapSuggestion & { playerAName: string; playerBName: string }) | null;
};

export type ServerAdaptiveDrawResult = {
  success: boolean;
  teams?: string[][];
  teamSummaries?: AdaptiveTeamSummary[];
  missingOverallCount?: number;
  missingSpeedCount?: number;
  balanceScore?: number;
  attendanceOrder?: string[];
  error?: string;
};

export interface RoundRepository {
  getRounds(seasonId: string, actor: Actor): Promise<RoundWithCounts[]>;
  getRound(roundId: string, leagueId: string, actor: Actor): Promise<RoundDetail | null>;
  getRoundMatchSetup(roundId: string, leagueId: string, actor: Actor): Promise<RoundMatchSetup | null>;
  getActiveLeague(leagueId: string, actor: Actor): Promise<{
    id: string;
    players_per_team: number;
    teams_per_round: number;
    match_duration: number;
    stadium_name: string | null;
    stadium_map_url: string | null;
    event_duration_minutes: number;
    preseason_enabled: boolean;
    feature_tier: string;
  }>;
  createRoundWithTeams(input: CreateRoundWithTeamsInput, leagueId: string, actor: Actor): Promise<{ roundId: string }>;
  deleteRound(roundId: string, leagueId: string, actor: Actor): Promise<void>;
  finishRound(roundId: string, leagueId: string, input: FinishRoundInput, actor: Actor): Promise<FinishRoundResult>;
  getAdminRoundPrelist(roundId: string, leagueId: string, actor: Actor): Promise<AdminRoundPrelist | null>;
  getAdminRoundPrelists(leagueId: string, actor: Actor): Promise<AdminRoundPrelist[]>;
  saveRoundPrelist(input: SaveRoundPrelistInput, leagueId: string, actor: Actor): Promise<SaveRoundPrelistResult>;
  setCallupFormat(callupId: string, leagueId: string, format: { playersPerTeam: number; teamsPerRound: number }, actor: Actor): Promise<{ fantasySizePreserved: boolean; fantasyLineupSize: number }>;
  setCallupMatchSize(callupId: string, leagueId: string, size: { playersPerTeam: number; teamsPerRound: number }, actor: Actor): Promise<void>;
  getNextTeamPresetOffset(leagueId: string, roundType: "official" | "friendly", actor: Actor): Promise<{ offset: number }>;
  markRoundTeamArrived(roundId: string, teamId: string, leagueId: string, arrived: boolean, actor: Actor): Promise<void>;
  openCallupReplacementVacancy(roundId: string, leagueId: string, outPlayerId: string, actor: Actor): Promise<void>;
  previewRoundTeamShuffle(roundId: string, leagueId: string, mode: string, actor: Actor): Promise<RoundTeamShufflePreview>;
  applyRoundTeamShuffle(
    roundId: string,
    leagueId: string,
    input: { mode: string; assignments?: RoundTeamShuffleAssignment[] },
    actor: Actor,
  ): Promise<void>;
  applyPermanentRoundTeamFormation(roundId: string, leagueId: string, input: TeamFormationInput, actor: Actor): Promise<void>;
  swapRoundTeamPlayers(roundId: string, leagueId: string, playerA: string, playerB: string, actor: Actor): Promise<void>;
  setRoundAttendanceBulk(roundId: string, leagueId: string, playerIds: string[], actor: Actor): Promise<void>;
  setRoundPlayerAttendance(roundId: string, leagueId: string, playerId: string, present: boolean, actor: Actor): Promise<void>;
  setRoundPlayerAvailability(roundId: string, leagueId: string, playerId: string, status: RoundPlayerAvailability, actor: Actor): Promise<void>;
  setRoundTeamCaptain(roundId: string, teamId: string, leagueId: string, captainId: string | null, actor: Actor): Promise<void>;
  setRoundTeamVestColor(roundId: string, teamId: string, leagueId: string, color: string, actor: Actor): Promise<void>;
  transferRoundPlayerIdentity(roundId: string, leagueId: string, fromId: string, toId: string, actor: Actor): Promise<void>;
  zeroPlayerRoundPoints(roundId: string, leagueId: string, playerId: string, actor: Actor): Promise<void>;
  addRoundEmergencySubstitute(roundId: string, leagueId: string, input: { name: string; teamId: string }, actor: Actor): Promise<{ playerId: string }>;

  // Draft
  createTeamDraft(roundId: string, callupId: string | null, leagueId: string, actor: Actor): Promise<{ draftId: string }>;
  getDraftWorkspace(callupId: string, leagueId: string, actor: Actor): Promise<DraftWorkspace | null>;
  getDraftWorkspaceByRound(roundId: string, leagueId: string, actor: Actor): Promise<DraftWorkspace | null>;
  startTeamDraft(draftId: string, leagueId: string, actor: Actor): Promise<void>;
  makeTeamDraftPick(draftId: string, leagueId: string, playerId: string, actor: Actor): Promise<void>;
  replaceTeamDraftCaptain(draftId: string, leagueId: string, teamSlot: number, newCaptainId: string, actor: Actor): Promise<void>;
  restartTeamDraft(draftId: string, leagueId: string, actor: Actor): Promise<void>;
  finalizeTeamDraft(draftId: string, leagueId: string, actor: Actor): Promise<{ roundId: string }>;
  applyDraftSwap(draftId: string, leagueId: string, playerAId: string, playerBId: string, actor: Actor): Promise<void>;

  // Adaptive Draw
  drawTeamsAdaptiveOnServer(input: {
    playerIds: string[];
    attendanceOrder?: string[];
    teamCount: number;
    playersPerTeam: number;
  }, leagueId: string, actor: Actor): Promise<ServerAdaptiveDrawResult>;
}

export function getRounds(seasonId: string, actor: Actor, repository: RoundRepository): Promise<RoundWithCounts[]> {
  return repository.getRounds(parseRoundUuid(seasonId, "Temporada"), actor);
}

export function getRound(roundId: string, leagueId: string, actor: Actor, repository: RoundRepository): Promise<RoundDetail | null> {
  return repository.getRound(parseRoundUuid(roundId, "Rodada"), parseRoundUuid(leagueId, "Pelada"), actor);
}

export function getRoundMatchSetup(roundId: string, leagueId: string, actor: Actor, repository: RoundRepository): Promise<RoundMatchSetup | null> {
  return repository.getRoundMatchSetup(parseRoundUuid(roundId, "Rodada"), parseRoundUuid(leagueId, "Pelada"), actor);
}

export function getActiveLeague(leagueId: string, actor: Actor, repository: RoundRepository) {
  return repository.getActiveLeague(parseRoundUuid(leagueId, "Pelada"), actor);
}

export function createRoundWithTeams(input: CreateRoundWithTeamsInput, leagueId: string, actor: Actor, repository: RoundRepository) {
  if (!input || !Array.isArray(input.teams) || input.teams.some((team) => !team || !Array.isArray(team.playerIds))) {
    throw new InvalidRoundError("Informe os times e seus jogadores.");
  }
  const teamsPerRound = input.teams.length;
  validateTeamSizes(input.playersPerTeam, teamsPerRound);
  const allowedFormationModes = new Set(["manual", "random", "balanced", "speed", "adaptive"]);
  const normalized: CreateRoundWithTeamsInput = {
    ...input,
    date: validateRoundDate(input.date),
    startTime: validateRoundTime(input.startTime || "08:00"),
    roundType: validateRoundType(input.roundType),
    callupId: input.callupId ? parseRoundUuid(input.callupId, "Convocação") : null,
    prelistRoundId: input.prelistRoundId ? parseRoundUuid(input.prelistRoundId, "Pré-lista") : null,
    stadiumId: input.stadiumId ? parseRoundUuid(input.stadiumId, "Estádio") : null,
    formationMode: input.formationMode && allowedFormationModes.has(input.formationMode) ? input.formationMode : "manual",
    attendanceOrder: [...new Set(Array.isArray(input.attendanceOrder) ? input.attendanceOrder : [])]
      .map((id) => parseRoundUuid(id, "Presença")),
    teams: input.teams.map((team) => ({
      ...team,
      playerIds: team.playerIds.map((id) => parseRoundUuid(id, "Jogador")),
      captainPlayerId: team.captainPlayerId ? parseRoundUuid(team.captainPlayerId, "Capitão") : null,
    })),
  };
  return repository.createRoundWithTeams(normalized, parseRoundUuid(leagueId, "Pelada"), actor);
}

export function deleteRound(roundId: string, leagueId: string, actor: Actor, repository: RoundRepository) {
  return repository.deleteRound(parseRoundUuid(roundId, "Rodada"), parseRoundUuid(leagueId, "Pelada"), actor);
}

export function finishRound(roundId: string, leagueId: string, input: FinishRoundInput, actor: Actor, repository: RoundRepository) {
  if (!input || typeof input.paymentPix !== "string" || !Array.isArray(input.expenseItemIds || [])) {
    throw new InvalidRoundError("Informe os dados financeiros da rodada.");
  }
  const paymentTotal = Number(input.paymentTotal);
  const paymentPix = input.paymentPix.trim();
  if (!Number.isFinite(paymentTotal) || paymentTotal <= 0 || paymentTotal > 99_999_999.99) {
    throw new InvalidRoundError("Informe um valor total válido para a pelada.");
  }
  if (!input.recipientId && (!paymentPix || paymentPix.length > 200)) {
    throw new InvalidRoundError("Informe uma chave PIX válida, com até 200 caracteres.");
  }
  return repository.finishRound(
    parseRoundUuid(roundId, "Rodada"),
    parseRoundUuid(leagueId, "Pelada"),
    {
      paymentPix,
      paymentTotal: Math.round(paymentTotal * 100) / 100,
      recipientId: input.recipientId ? parseRoundUuid(input.recipientId, "Destinatário") : null,
      recipientName: input.recipientName?.trim() || null,
      expenseItemIds: [...new Set(input.expenseItemIds || [])].map((id) => parseRoundUuid(id, "Despesa")),
    },
    actor,
  );
}

export function getAdminRoundPrelist(roundId: string, leagueId: string, actor: Actor, repository: RoundRepository) {
  return repository.getAdminRoundPrelist(parseRoundUuid(roundId, "Rodada"), parseRoundUuid(leagueId, "Pelada"), actor);
}

export function getAdminRoundPrelists(leagueId: string, actor: Actor, repository: RoundRepository) {
  return repository.getAdminRoundPrelists(parseRoundUuid(leagueId, "Pelada"), actor);
}

export function saveRoundPrelist(input: SaveRoundPrelistInput, leagueId: string, actor: Actor, repository: RoundRepository) {
  const normalized: SaveRoundPrelistInput = {
    ...input,
    date: validateRoundDate(input.date),
    startTime: validateRoundTime(input.startTime),
    roundType: validateRoundType(input.roundType),
    playerIds: [...new Set(input.playerIds)].map((id) => parseRoundUuid(id, "Jogador")),
    roundId: input.roundId ? parseRoundUuid(input.roundId, "Rodada") : null,
    callupId: input.callupId ? parseRoundUuid(input.callupId, "Convocação") : null,
    stadiumId: input.stadiumId ? parseRoundUuid(input.stadiumId, "Estádio") : null,
  };
  return repository.saveRoundPrelist(normalized, parseRoundUuid(leagueId, "Pelada"), actor);
}

export function createTeamDraft(
  input: { roundId: string; callupId?: string | null },
  leagueId: string,
  actor: Actor,
  repository: RoundRepository,
) {
  return repository.createTeamDraft(
    parseRoundUuid(input.roundId, "Rodada"),
    input.callupId ? parseRoundUuid(input.callupId, "Convocação") : null,
    parseRoundUuid(leagueId, "Pelada"),
    actor,
  );
}

export function getDraftWorkspace(callupId: string, leagueId: string, actor: Actor, repository: RoundRepository) {
  return repository.getDraftWorkspace(
    parseRoundUuid(callupId, "Convocação"),
    parseRoundUuid(leagueId, "Pelada"),
    actor,
  );
}

export function getDraftWorkspaceByRound(roundId: string, leagueId: string, actor: Actor, repository: RoundRepository) {
  return repository.getDraftWorkspaceByRound(
    parseRoundUuid(roundId, "Rodada"),
    parseRoundUuid(leagueId, "Pelada"),
    actor,
  );
}

export function startTeamDraft(draftId: string, leagueId: string, actor: Actor, repository: RoundRepository) {
  return repository.startTeamDraft(parseRoundUuid(draftId, "Draft"), parseRoundUuid(leagueId, "Pelada"), actor);
}

export function makeTeamDraftPick(draftId: string, leagueId: string, playerId: string, actor: Actor, repository: RoundRepository) {
  return repository.makeTeamDraftPick(
    parseRoundUuid(draftId, "Draft"),
    parseRoundUuid(leagueId, "Pelada"),
    parseRoundUuid(playerId, "Jogador"),
    actor,
  );
}

export function replaceTeamDraftCaptain(
  draftId: string,
  leagueId: string,
  teamSlot: number,
  playerId: string,
  actor: Actor,
  repository: RoundRepository,
) {
  if (!Number.isInteger(teamSlot) || teamSlot < 1 || teamSlot > 3) {
    throw new InvalidRoundError("Escolha um time válido para trocar o capitão.");
  }
  return repository.replaceTeamDraftCaptain(
    parseRoundUuid(draftId, "Draft"),
    parseRoundUuid(leagueId, "Pelada"),
    teamSlot,
    parseRoundUuid(playerId, "Capitão"),
    actor,
  );
}

export function restartTeamDraft(draftId: string, leagueId: string, actor: Actor, repository: RoundRepository) {
  return repository.restartTeamDraft(parseRoundUuid(draftId, "Draft"), parseRoundUuid(leagueId, "Pelada"), actor);
}

export function finalizeTeamDraft(draftId: string, leagueId: string, actor: Actor, repository: RoundRepository) {
  return repository.finalizeTeamDraft(parseRoundUuid(draftId, "Draft"), parseRoundUuid(leagueId, "Pelada"), actor);
}

export function applyDraftSwap(
  draftId: string,
  leagueId: string,
  playerAId: string,
  playerBId: string,
  actor: Actor,
  repository: RoundRepository,
) {
  const playerA = parseRoundUuid(playerAId, "Jogador A");
  const playerB = parseRoundUuid(playerBId, "Jogador B");
  if (playerA === playerB) throw new InvalidRoundError("Escolha dois jogadores diferentes.");
  return repository.applyDraftSwap(
    parseRoundUuid(draftId, "Draft"),
    parseRoundUuid(leagueId, "Pelada"),
    playerA,
    playerB,
    actor,
  );
}

export function drawTeamsAdaptiveOnServer(
  input: { playerIds: string[]; attendanceOrder?: string[]; teamCount: number; playersPerTeam: number },
  leagueId: string,
  actor: Actor,
  repository: RoundRepository,
) {
  if (!input || !Array.isArray(input.playerIds) || !Array.isArray(input.attendanceOrder || [])) {
    throw new InvalidRoundError("Configuração de times inválida.");
  }
  const teamCount = Math.trunc(input.teamCount);
  const playersPerTeam = Math.trunc(input.playersPerTeam);
  const playerIds = [...new Set(input.playerIds)].map((id) => parseRoundUuid(id, "Jogador"));
  if (teamCount < 2 || teamCount > 4 || playersPerTeam < 1 || playersPerTeam > 10) {
    throw new InvalidRoundError("Configuração de times inválida.");
  }
  if (!playerIds.length || playerIds.length > teamCount * playersPerTeam) {
    throw new InvalidRoundError("Quantidade de jogadores inválida para o sorteio.");
  }
  return repository.drawTeamsAdaptiveOnServer({
    playerIds,
    attendanceOrder: [...new Set(input.attendanceOrder || [])].map((id) => parseRoundUuid(id, "Presença")),
    teamCount,
    playersPerTeam,
  }, parseRoundUuid(leagueId, "Pelada"), actor);
}
