import type { Actor } from "../../../shared/actor.js";
import {
  parseRoundUuid,
  validateRoundDate,
  type Round,
  type RoundMatchSetup,
  type RoundPlayerAttendance,
  type RoundPlayerAvailability,
  type RoundWithCounts,
} from "../domain/round.js";

export type AdminRoundPrelist = {
  id: string;
  number: number;
  date: string;
  start_time: string | null;
  status: string;
  round_type: string;
  preparation_stage: string;
  callup_id: string | null;
  players: Array<{
    player_id: string;
    name: string;
    nickname: string | null;
    avatar_url: string | null;
    status: string;
  }>;
};

export type SaveRoundPrelistInput = {
  date: string;
  startTime?: string | null;
  roundType?: "friendly" | "official";
  playerIds: string[];
  callupId?: string | null;
  roundId?: string | null;
  stadiumId?: string | null;
  stadiumName?: string | null;
  stadiumMapUrl?: string | null;
};

export type CreateRoundWithTeamsInput = {
  date: string;
  startTime?: string | null;
  roundType: "friendly" | "official";
  playersPerTeam: number;
  teams: Array<{
    name: string;
    color: string;
    crestUrl?: string | null;
    playerIds: string[];
    captainPlayerId?: string | null;
  }>;
};

export type TeamFormationInput = {
  teams: Array<{
    teamId: string;
    playerIds: string[];
    captainPlayerId?: string | null;
  }>;
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
      profile: string | null;
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
    profile: string | null;
    overall: number | null;
    stars: number | null;
    teamSlot: number | null;
    isCaptain: boolean;
    pickNumber: number | null;
    active: boolean;
  }>;
  summaries?: unknown;
  balanceScore?: number;
  suggestion?: unknown;
};

export type ServerAdaptiveDrawResult = {
  success: boolean;
  teams?: string[][];
  teamSummaries?: unknown[];
  missingOverallCount?: number;
  missingSpeedCount?: number;
  balanceScore?: number;
  attendanceOrder?: string[];
  error?: string;
};

export interface RoundRepository {
  getRounds(seasonId: string, actor: Actor): Promise<RoundWithCounts[]>;
  getRound(roundId: string, leagueId: string, actor: Actor): Promise<Round | null>;
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
  finishRound(roundId: string, leagueId: string, bestGoalkeeperPlayerId: string | null, actor: Actor): Promise<void>;
  getAdminRoundPrelist(roundId: string, leagueId: string, actor: Actor): Promise<AdminRoundPrelist | null>;
  getAdminRoundPrelists(leagueId: string, actor: Actor): Promise<AdminRoundPrelist[]>;
  saveRoundPrelist(input: SaveRoundPrelistInput, leagueId: string, actor: Actor): Promise<{ roundId: string }>;
  setCallupFormat(callupId: string, leagueId: string, format: { playersPerTeam: number; teamsPerRound: number }, actor: Actor): Promise<{ fantasySizePreserved: boolean; fantasyLineupSize: number }>;
  setCallupMatchSize(callupId: string, leagueId: string, size: { playersPerTeam: number }, actor: Actor): Promise<void>;
  getNextTeamPresetOffset(leagueId: string, actor: Actor): Promise<{ offset: number }>;
  markRoundTeamArrived(roundId: string, teamId: string, leagueId: string, arrived: boolean, actor: Actor): Promise<void>;
  openCallupReplacementVacancy(callupId: string, leagueId: string, actor: Actor): Promise<void>;
  previewRoundTeamShuffle(roundId: string, leagueId: string, mode: string, actor: Actor): Promise<unknown>;
  applyRoundTeamShuffle(roundId: string, leagueId: string, mode: string, actor: Actor): Promise<void>;
  applyPermanentRoundTeamFormation(roundId: string, leagueId: string, input: TeamFormationInput, actor: Actor): Promise<void>;
  shuffleRoundTeams(roundId: string, leagueId: string, options: unknown, actor: Actor): Promise<void>;
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
  getDraftWorkspace(draftId: string, leagueId: string, actor: Actor): Promise<DraftWorkspace | null>;
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

export function getRound(roundId: string, leagueId: string, actor: Actor, repository: RoundRepository): Promise<Round | null> {
  return repository.getRound(parseRoundUuid(roundId, "Rodada"), parseRoundUuid(leagueId, "Pelada"), actor);
}

export function getRoundMatchSetup(roundId: string, leagueId: string, actor: Actor, repository: RoundRepository): Promise<RoundMatchSetup | null> {
  return repository.getRoundMatchSetup(parseRoundUuid(roundId, "Rodada"), parseRoundUuid(leagueId, "Pelada"), actor);
}

export function getActiveLeague(leagueId: string, actor: Actor, repository: RoundRepository) {
  return repository.getActiveLeague(parseRoundUuid(leagueId, "Pelada"), actor);
}

export function createRoundWithTeams(input: CreateRoundWithTeamsInput, leagueId: string, actor: Actor, repository: RoundRepository) {
  validateRoundDate(input.date);
  return repository.createRoundWithTeams(input, parseRoundUuid(leagueId, "Pelada"), actor);
}

export function deleteRound(roundId: string, leagueId: string, actor: Actor, repository: RoundRepository) {
  return repository.deleteRound(parseRoundUuid(roundId, "Rodada"), parseRoundUuid(leagueId, "Pelada"), actor);
}

export function finishRound(roundId: string, leagueId: string, bestGoalkeeperPlayerId: string | null, actor: Actor, repository: RoundRepository) {
  return repository.finishRound(
    parseRoundUuid(roundId, "Rodada"),
    parseRoundUuid(leagueId, "Pelada"),
    bestGoalkeeperPlayerId ? parseRoundUuid(bestGoalkeeperPlayerId, "Goleiro") : null,
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
  validateRoundDate(input.date);
  return repository.saveRoundPrelist(input, parseRoundUuid(leagueId, "Pelada"), actor);
}
