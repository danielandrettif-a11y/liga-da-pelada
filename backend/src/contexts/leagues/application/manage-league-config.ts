import type { Actor } from "../../../shared/actor.js";
import { parseLeagueId } from "../domain/league.js";
import { parseLeagueName, parseLeagueSettings, type LeagueSettings } from "../domain/league-settings.js";

export type LeagueConfig = {
  id: string;
  name: string;
  match_duration: number;
  players_per_team: number;
  teams_per_round: number;
  preseason_enabled: boolean;
  stadium_name: string | null;
  stadium_map_url: string | null;
  event_duration_minutes: number;
  visibility: "private" | "open";
  logo_url: string | null;
  cover_url: string | null;
  accent_color: string;
  can_manage: boolean;
};

export interface LeagueConfigRepository {
  getConfig(leagueId: string, actor: Actor): Promise<LeagueConfig>;
  updateName(leagueId: string, name: string, actor: Actor): Promise<string>;
  updateSettings(leagueId: string, settings: LeagueSettings, actor: Actor): Promise<void>;
  setPreseason(leagueId: string, enabled: boolean, actor: Actor): Promise<void>;
}

export function getLeagueConfig(
  leagueId: string,
  actor: Actor,
  repository: LeagueConfigRepository,
): Promise<LeagueConfig> {
  return repository.getConfig(parseLeagueId(leagueId), actor);
}

export async function updateLeagueName(
  leagueId: string,
  name: string,
  actor: Actor,
  repository: LeagueConfigRepository,
) {
  return { name: await repository.updateName(parseLeagueId(leagueId), parseLeagueName(name), actor) };
}

export async function updateLeagueSettings(
  leagueId: string,
  input: Parameters<typeof parseLeagueSettings>[0],
  actor: Actor,
  repository: LeagueConfigRepository,
) {
  await repository.updateSettings(parseLeagueId(leagueId), parseLeagueSettings(input), actor);
  return { updated: true };
}

export async function updateLeaguePreseason(
  leagueId: string,
  enabled: boolean,
  actor: Actor,
  repository: LeagueConfigRepository,
) {
  await repository.setPreseason(parseLeagueId(leagueId), enabled, actor);
  return { enabled };
}
