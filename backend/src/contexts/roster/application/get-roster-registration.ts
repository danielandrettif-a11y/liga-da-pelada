import type { Actor } from "../../../shared/actor.js";
import { orderedPlayers, type PlayerCatalogRecord, type RosterPlayer } from "../domain/player-catalog.js";
import {
  parseRosterRegistrationUuid,
  validatePlayerMergeIds,
  type PlayerRegistrationEvent,
} from "../domain/roster-registration.js";

export interface RosterRegistrationRepository {
  listHistory(leagueId: string, actor: Actor): Promise<PlayerRegistrationEvent[]>;
  listMergeCandidates(leagueId: string, guestId: string, actor: Actor): Promise<PlayerCatalogRecord[]>;
  mergePlayers(leagueId: string, guestId: string, registeredId: string, actor: Actor): Promise<string[]>;
}

export function getRegistrationHistory(
  leagueId: string,
  actor: Actor,
  repository: RosterRegistrationRepository,
): Promise<PlayerRegistrationEvent[]> {
  return repository.listHistory(parseRosterRegistrationUuid(leagueId, "Pelada"), actor);
}

export async function getRegisteredMergeCandidates(
  leagueId: string,
  guestId: string,
  actor: Actor,
  repository: RosterRegistrationRepository,
): Promise<RosterPlayer[]> {
  const records = await repository.listMergeCandidates(
    parseRosterRegistrationUuid(leagueId, "Pelada"),
    parseRosterRegistrationUuid(guestId, "Jogador"),
    actor,
  );
  return orderedPlayers(records, false);
}

export async function mergeGuestPlayer(
  leagueId: string,
  guestId: string,
  registeredId: string,
  actor: Actor,
  repository: RosterRegistrationRepository,
): Promise<{ playerId: string; affectedRoundIds: string[] }> {
  const cleanLeague = parseRosterRegistrationUuid(leagueId, "Pelada");
  const { guestId: cleanGuest, registeredId: cleanRegistered } = validatePlayerMergeIds(guestId, registeredId);
  const affectedRoundIds = await repository.mergePlayers(cleanLeague, cleanGuest, cleanRegistered, actor);
  return { playerId: cleanGuest, affectedRoundIds };
}
