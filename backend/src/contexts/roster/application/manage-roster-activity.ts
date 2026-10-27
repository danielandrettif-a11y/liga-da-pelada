import type { Actor } from "../../../shared/actor.js";
import {
  normalizeSeenThrough,
  parseRosterActivityUuid,
  unreadPlayersFromEvents,
  type RosterUnreadState,
  type UnreadRosterEvent,
  type UnreadRosterPlayers,
} from "../domain/roster-activity.js";

export interface RosterActivityRepository {
  getUnreadState(leagueId: string, actor: Actor): Promise<RosterUnreadState>;
  listUnreadEvents(leagueId: string, actor: Actor): Promise<UnreadRosterEvent[]>;
  markSeenThrough(leagueId: string, seenThrough: string, actor: Actor): Promise<void>;
  markSeen(leagueId: string, actor: Actor): Promise<void>;
}

export function getRosterUnreadState(
  leagueId: string, actor: Actor, repository: RosterActivityRepository,
): Promise<RosterUnreadState> {
  return repository.getUnreadState(parseRosterActivityUuid(leagueId, "Pelada"), actor);
}

export async function getUnreadRosterPlayers(
  leagueId: string, actor: Actor, repository: RosterActivityRepository,
): Promise<UnreadRosterPlayers> {
  const events = await repository.listUnreadEvents(parseRosterActivityUuid(leagueId, "Pelada"), actor);
  return unreadPlayersFromEvents(events);
}

export function markRosterActivitySeenThrough(
  leagueId: string,
  seenThrough: string,
  actor: Actor,
  repository: RosterActivityRepository,
  now: Date = new Date(),
): Promise<void> {
  return repository.markSeenThrough(
    parseRosterActivityUuid(leagueId, "Pelada"), normalizeSeenThrough(seenThrough, now), actor,
  );
}

export function markRosterActivitySeen(
  leagueId: string, actor: Actor, repository: RosterActivityRepository,
): Promise<void> {
  return repository.markSeen(parseRosterActivityUuid(leagueId, "Pelada"), actor);
}
