import type { Actor } from "../../../shared/actor.js";
import {
  orderedPlayers,
  parsePlayerCatalogUuid,
  playerFromCatalogRecord,
  type PlayerCatalogRecord,
  type RosterPlayer,
} from "../domain/player-catalog.js";

export interface PlayerCatalogRepository {
  list(leagueId: string, actor: Actor): Promise<PlayerCatalogRecord[]>;
  get(leagueId: string, playerId: string, actor: Actor): Promise<PlayerCatalogRecord | null>;
}

export async function getPlayers(
  leagueId: string,
  selectableOnly: boolean,
  actor: Actor,
  repository: PlayerCatalogRepository,
): Promise<RosterPlayer[]> {
  const records = await repository.list(parsePlayerCatalogUuid(leagueId, "Pelada"), actor);
  return orderedPlayers(records, selectableOnly);
}

export async function getPlayer(
  leagueId: string,
  playerId: string,
  actor: Actor,
  repository: PlayerCatalogRepository,
): Promise<RosterPlayer | null> {
  const record = await repository.get(
    parsePlayerCatalogUuid(leagueId, "Pelada"),
    parsePlayerCatalogUuid(playerId, "Jogador"),
    actor,
  );
  return record ? playerFromCatalogRecord(record) : null;
}
