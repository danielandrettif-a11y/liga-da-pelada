import type { Actor } from "../../../shared/actor.js";
import {
  parseCallupUuid,
  validateOpenCallupInput,
  validateUpdateCallupInput,
  type AgendaCallup,
  type Callup,
  type CallupEntryStatus,
  type OpenCallupInput,
  type UpdateCallupInput,
} from "../domain/callup.js";

export type CallupInviteResult = {
  playerId: string;
  status: CallupEntryStatus;
  position: number;
};

export type CallupGuestListResult = {
  created: number;
  confirmed: number;
  waitlisted: number;
  failed: Array<{ name: string; error: string }>;
};

export interface CallupRepository {
  listActive(leagueId: string, actor: Actor, inviteCallupId?: string): Promise<Callup[]>;
  listAgenda(leagueId: string, actor: Actor): Promise<AgendaCallup[]>;
  openCallup(leagueId: string, input: ReturnType<typeof validateOpenCallupInput>, actor: Actor): Promise<{ callupId: string; roundId: string }>;
  updateCallup(leagueId: string, callupId: string, input: ReturnType<typeof validateUpdateCallupInput>, actor: Actor): Promise<void>;
  closeCallup(leagueId: string, callupId: string, actor: Actor): Promise<void>;
  setVisibility(leagueId: string, callupId: string, isPublic: boolean, actor: Actor): Promise<void>;
  lockCallup(leagueId: string, callupId: string, actor: Actor): Promise<void>;
  joinCallup(leagueId: string, callupId: string, actor: Actor): Promise<{ status: CallupEntryStatus; position: number }>;
  leaveCallup(leagueId: string, callupId: string, actor: Actor): Promise<{ roundId?: string | null }>;
  addPlayer(leagueId: string, callupId: string, playerId: string, asAdmin: boolean, actor: Actor): Promise<{ status: CallupEntryStatus; position: number }>;
  removePlayer(leagueId: string, callupId: string, playerId: string, asAdmin: boolean, actor: Actor): Promise<{ revalidateRoundId?: string | null }>;
  inviteGuest(leagueId: string, callupId: string, guest: { name: string; playerProfile?: string; isGoalkeeper?: boolean }, actor: Actor): Promise<CallupInviteResult>;
  inviteGuestList(leagueId: string, callupId: string, guests: Array<{ name: string; isGoalkeeper?: boolean }>, playerProfile: string, actor: Actor): Promise<CallupGuestListResult>;
  createPrelist(leagueId: string, callupId: string, actor: Actor): Promise<{ roundId: string; created: boolean }>;
  repairMyPlayer(actor: Actor): Promise<{ playerId?: string }>;
}

export function listActiveCallups(
  leagueId: string,
  actor: Actor,
  repository: CallupRepository,
  inviteCallupId?: string,
): Promise<Callup[]> {
  const cleanLeague = leagueId ? parseCallupUuid(leagueId, "Pelada") : "";
  const cleanInvite = inviteCallupId ? parseCallupUuid(inviteCallupId, "Convocação convidada") : undefined;
  return repository.listActive(cleanLeague, actor, cleanInvite);
}

export function listAgendaCallups(
  leagueId: string,
  actor: Actor,
  repository: CallupRepository,
): Promise<AgendaCallup[]> {
  return repository.listAgenda(parseCallupUuid(leagueId, "Pelada"), actor);
}

export function openCallup(
  leagueId: string,
  input: OpenCallupInput,
  actor: Actor,
  repository: CallupRepository,
): Promise<{ callupId: string; roundId: string }> {
  const cleanLeague = parseCallupUuid(leagueId, "Pelada");
  const validated = validateOpenCallupInput(input);
  return repository.openCallup(cleanLeague, validated, actor);
}

export function updateCallup(
  leagueId: string,
  callupId: string,
  input: UpdateCallupInput,
  actor: Actor,
  repository: CallupRepository,
): Promise<void> {
  const cleanLeague = parseCallupUuid(leagueId, "Pelada");
  const cleanCallup = parseCallupUuid(callupId, "Convocação");
  const validated = validateUpdateCallupInput(input);
  return repository.updateCallup(cleanLeague, cleanCallup, validated, actor);
}

export function closeCallup(
  leagueId: string,
  callupId: string,
  actor: Actor,
  repository: CallupRepository,
): Promise<void> {
  return repository.closeCallup(parseCallupUuid(leagueId, "Pelada"), parseCallupUuid(callupId, "Convocação"), actor);
}

export function setCallupVisibility(
  leagueId: string,
  callupId: string,
  isPublic: boolean,
  actor: Actor,
  repository: CallupRepository,
): Promise<void> {
  return repository.setVisibility(parseCallupUuid(leagueId, "Pelada"), parseCallupUuid(callupId, "Convocação"), isPublic, actor);
}

export function lockCallup(
  leagueId: string,
  callupId: string,
  actor: Actor,
  repository: CallupRepository,
): Promise<void> {
  return repository.lockCallup(parseCallupUuid(leagueId, "Pelada"), parseCallupUuid(callupId, "Convocação"), actor);
}

export function joinCallup(
  leagueId: string,
  callupId: string,
  actor: Actor,
  repository: CallupRepository,
): Promise<{ status: CallupEntryStatus; position: number }> {
  return repository.joinCallup(parseCallupUuid(leagueId, "Pelada"), parseCallupUuid(callupId, "Convocação"), actor);
}

export function leaveCallup(
  leagueId: string,
  callupId: string,
  actor: Actor,
  repository: CallupRepository,
): Promise<{ roundId?: string | null }> {
  return repository.leaveCallup(parseCallupUuid(leagueId, "Pelada"), parseCallupUuid(callupId, "Convocação"), actor);
}

export function addPlayerToCallup(
  leagueId: string,
  callupId: string,
  playerId: string,
  asAdmin: boolean,
  actor: Actor,
  repository: CallupRepository,
): Promise<{ status: CallupEntryStatus; position: number }> {
  return repository.addPlayer(
    parseCallupUuid(leagueId, "Pelada"),
    parseCallupUuid(callupId, "Convocação"),
    parseCallupUuid(playerId, "Jogador"),
    asAdmin,
    actor,
  );
}

export function removePlayerFromCallup(
  leagueId: string,
  callupId: string,
  playerId: string,
  asAdmin: boolean,
  actor: Actor,
  repository: CallupRepository,
): Promise<{ revalidateRoundId?: string | null }> {
  return repository.removePlayer(
    parseCallupUuid(leagueId, "Pelada"),
    parseCallupUuid(callupId, "Convocação"),
    parseCallupUuid(playerId, "Jogador"),
    asAdmin,
    actor,
  );
}

export function inviteGuestToCallup(
  leagueId: string,
  callupId: string,
  guest: { name: string; playerProfile?: string; isGoalkeeper?: boolean },
  actor: Actor,
  repository: CallupRepository,
): Promise<CallupInviteResult> {
  return repository.inviteGuest(
    parseCallupUuid(leagueId, "Pelada"),
    parseCallupUuid(callupId, "Convocação"),
    guest,
    actor,
  );
}

export function inviteGuestListToCallup(
  leagueId: string,
  callupId: string,
  guests: Array<{ name: string; isGoalkeeper?: boolean }>,
  playerProfile: string,
  actor: Actor,
  repository: CallupRepository,
): Promise<CallupGuestListResult> {
  return repository.inviteGuestList(
    parseCallupUuid(leagueId, "Pelada"),
    parseCallupUuid(callupId, "Convocação"),
    guests,
    playerProfile,
    actor,
  );
}

export function createCallupPrelist(
  leagueId: string,
  callupId: string,
  actor: Actor,
  repository: CallupRepository,
): Promise<{ roundId: string; created: boolean }> {
  return repository.createPrelist(
    parseCallupUuid(leagueId, "Pelada"),
    parseCallupUuid(callupId, "Convocação"),
    actor,
  );
}

export function repairMyPlayerAccount(
  actor: Actor,
  repository: CallupRepository,
): Promise<{ playerId?: string }> {
  return repository.repairMyPlayer(actor);
}
