import type { Actor } from "../../../shared/actor.js";
import {
  normalizeCreatePlayer,
  normalizeGuestNames,
  normalizeUpdatePlayer,
  parsePlayerManagementUuid,
  type CreatePlayerCommand,
  type ImportedGuest,
  type UpdatePlayerCommand,
} from "../domain/player-management.js";
import { playerFromCatalogRecord, type PlayerCatalogRecord, type RosterPlayer } from "../domain/player-catalog.js";

export interface PlayerManagementRepository {
  create(leagueId: string, command: CreatePlayerCommand, actor: Actor): Promise<PlayerCatalogRecord>;
  update(
    leagueId: string, playerId: string, command: UpdatePlayerCommand, actor: Actor,
  ): Promise<PlayerCatalogRecord>;
  swapAvatars(leagueId: string, playerId: string, actor: Actor): Promise<void>;
  importGuests(leagueId: string, names: string[], actor: Actor): Promise<ImportedGuest[]>;
}

export async function createPlayer(
  leagueId: string, input: unknown, actor: Actor, repository: PlayerManagementRepository,
): Promise<RosterPlayer> {
  const result = await repository.create(
    parsePlayerManagementUuid(leagueId, "Pelada"), normalizeCreatePlayer(input), actor,
  );
  return playerFromCatalogRecord(result);
}

export async function updatePlayer(
  leagueId: string,
  playerId: string,
  input: unknown,
  actor: Actor,
  repository: PlayerManagementRepository,
): Promise<RosterPlayer> {
  const result = await repository.update(
    parsePlayerManagementUuid(leagueId, "Pelada"),
    parsePlayerManagementUuid(playerId, "Jogador"),
    normalizeUpdatePlayer(input),
    actor,
  );
  return playerFromCatalogRecord(result);
}

export function swapPlayerAvatars(
  leagueId: string, playerId: string, actor: Actor, repository: PlayerManagementRepository,
): Promise<void> {
  return repository.swapAvatars(
    parsePlayerManagementUuid(leagueId, "Pelada"),
    parsePlayerManagementUuid(playerId, "Jogador"),
    actor,
  );
}

export function importGuestRoster(
  leagueId: string, names: unknown, actor: Actor, repository: PlayerManagementRepository,
): Promise<ImportedGuest[]> {
  return repository.importGuests(
    parsePlayerManagementUuid(leagueId, "Pelada"), normalizeGuestNames(names), actor,
  );
}
