import type { Actor } from "../../../shared/actor.js";
import {
  parseEntryFlowVersion,
  parseLeagueSelection,
  type LeagueSelectionMode,
} from "../domain/league-entry.js";

export interface LeagueEntryRepository {
  completeEntryFlow(version: number, actor: Actor): Promise<void>;
  authorizeSelection(leagueId: string, mode: LeagueSelectionMode, actor: Actor): Promise<void>;
}

export async function completeLeagueEntryFlow(
  version: number, actor: Actor, repository: LeagueEntryRepository,
) {
  await repository.completeEntryFlow(parseEntryFlowVersion(version), actor);
  return { completed: true };
}

export async function authorizeLeagueSelection(
  leagueId: string, mode: string, actor: Actor, repository: LeagueEntryRepository,
) {
  const selection = parseLeagueSelection(leagueId, mode);
  await repository.authorizeSelection(selection.leagueId, selection.mode, actor);
  return { authorized: true };
}
