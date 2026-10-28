import { randomUUID } from "node:crypto";
import type { Actor } from "../../../shared/actor.js";
import { parsePlayerManagementUuid } from "../domain/player-management.js";
import {
  parsePlayerProfileForm,
  resolvePlayerProfileCommand,
  type PlayerAvatarAsset,
  type PlayerProfileAccess,
  type SavePlayerProfileCommand,
} from "../domain/player-profile.js";

export interface PlayerProfileRepository {
  getSaveAccess(leagueId: string, playerId: string | null, actor: Actor): Promise<PlayerProfileAccess>;
  saveProfile(
    leagueId: string, command: SavePlayerProfileCommand, creating: boolean, actor: Actor,
  ): Promise<void>;
  delete(leagueId: string, playerId: string, actor: Actor): Promise<{
    avatarUrl: string | null; avatarAlternateUrl: string | null;
  }>;
}

export interface PlayerAvatarStorage {
  upload(playerId: string, asset: PlayerAvatarAsset, accessToken: string): Promise<{ path: string; publicUrl: string }>;
  remove(paths: string[], accessToken: string): Promise<void>;
  pathFromPublicUrl(url: string | null): string | null;
}

type RawProfileForm = Parameters<typeof parsePlayerProfileForm>[0];

function nextAvatarUrls(input: ReturnType<typeof parsePlayerProfileForm>, access: PlayerProfileAccess) {
  let active = input.removeActiveAvatar ? null : access.current?.avatarUrl ?? null;
  let alternate = input.removeAlternateAvatar ? null : access.current?.avatarAlternateUrl ?? null;
  if (!active && alternate) [active, alternate] = [alternate, null];
  if (active && active === alternate) alternate = null;
  return { active, alternate };
}

export async function savePlayerProfile(
  leagueId: string,
  playerId: string | null,
  raw: RawProfileForm,
  actor: Actor,
  accessToken: string,
  repository: PlayerProfileRepository,
  storage: PlayerAvatarStorage,
): Promise<string> {
  const scope = parsePlayerManagementUuid(leagueId, "Pelada");
  const id = playerId ? parsePlayerManagementUuid(playerId, "Jogador") : randomUUID();
  const input = parsePlayerProfileForm(raw);
  const access = await repository.getSaveAccess(scope, playerId ? id : null, actor);
  const creating = access.current === null;
  let urls = nextAvatarUrls(input, access);
  const uploaded: { slot: PlayerAvatarAsset["slot"]; path: string; publicUrl: string }[] = [];
  let provisionalCreated = false;

  try {
    if (creating) {
      const command = resolvePlayerProfileCommand(id, input, access, urls.active, urls.alternate);
      await repository.saveProfile(scope, command, true, actor);
      provisionalCreated = true;
    }

    for (const asset of [input.activeAvatar, input.alternateAvatar]) {
      if (!asset) continue;
      uploaded.push({ slot: asset.slot, ...await storage.upload(id, asset, accessToken) });
    }
    for (const item of uploaded) {
      if (item.slot === "active") urls.active = item.publicUrl;
      else urls.alternate = item.publicUrl;
    }
    if (input.useAlternateAvatar && urls.alternate) [urls.active, urls.alternate] = [urls.alternate, urls.active];
    if (!urls.active && urls.alternate) [urls.active, urls.alternate] = [urls.alternate, null];
    if (urls.active && urls.active === urls.alternate) urls.alternate = null;

    if (!creating || uploaded.length) {
      const updateAccess = creating ? { ...access, current: {
        profileBio: null,
        avatarUrl: null,
        avatarAlternateUrl: null,
        memberCategory: input.memberCategory,
        isSelectable: input.isSelectable,
        playerProfile: input.playerProfile,
        overallTraits: input.overallTraits,
        isGoalkeeper: false,
      } } : access;
      const command = resolvePlayerProfileCommand(id, input, updateAccess, urls.active, urls.alternate);
      await repository.saveProfile(scope, command, false, actor);
    }

    const retained = new Set([urls.active, urls.alternate].filter((url): url is string => Boolean(url)));
    const oldPaths = [access.current?.avatarUrl, access.current?.avatarAlternateUrl]
      .filter((url): url is string => Boolean(url) && !retained.has(url!))
      .map((url) => storage.pathFromPublicUrl(url))
      .filter((path): path is string => Boolean(path) && path!.startsWith(`${id}/`));
    if (oldPaths.length) await storage.remove([...new Set(oldPaths)], accessToken).catch(() => undefined);
    return id;
  } catch (error) {
    if (uploaded.length) await storage.remove(uploaded.map((item) => item.path), accessToken).catch(() => undefined);
    if (provisionalCreated) await repository.delete(scope, id, actor).catch(() => undefined);
    throw error;
  }
}

export async function deletePlayerProfile(
  leagueId: string,
  playerId: string,
  actor: Actor,
  accessToken: string,
  repository: PlayerProfileRepository,
  storage: PlayerAvatarStorage,
): Promise<void> {
  const scope = parsePlayerManagementUuid(leagueId, "Pelada");
  const id = parsePlayerManagementUuid(playerId, "Jogador");
  const deleted = await repository.delete(scope, id, actor);
  const paths = [deleted.avatarUrl, deleted.avatarAlternateUrl]
    .map((url) => storage.pathFromPublicUrl(url))
    .filter((path): path is string => Boolean(path) && path!.startsWith(`${id}/`));
  if (paths.length) await storage.remove([...new Set(paths)], accessToken).catch(() => undefined);
}
