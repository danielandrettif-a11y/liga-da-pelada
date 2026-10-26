import type { Actor } from "../../../shared/actor.js";
import { parseLeagueId } from "../domain/league.js";
import { parseLeagueBranding, type BrandingAsset } from "../domain/league-branding.js";

export type CurrentLeagueBranding = { logoUrl: string | null; coverUrl: string | null };
export type LeagueBrandingUpdate = {
  accentColor: string;
  logoUrl?: string | null;
  coverUrl?: string | null;
};

export interface LeagueBrandingRepository {
  getCurrent(leagueId: string, actor: Actor): Promise<CurrentLeagueBranding>;
  update(leagueId: string, update: LeagueBrandingUpdate, actor: Actor): Promise<void>;
}

export interface LeagueBrandingStorage {
  upload(leagueId: string, asset: BrandingAsset, accessToken: string): Promise<{ path: string; publicUrl: string }>;
  remove(paths: string[], accessToken: string): Promise<void>;
  pathFromPublicUrl(url: string | null): string | null;
}

export async function updateLeagueBranding(
  leagueId: string,
  raw: Parameters<typeof parseLeagueBranding>[0],
  actor: Actor,
  accessToken: string,
  repository: LeagueBrandingRepository,
  storage: LeagueBrandingStorage,
) {
  const scope = parseLeagueId(leagueId);
  const input = parseLeagueBranding(raw);
  const current = await repository.getCurrent(scope, actor);
  const uploaded: { kind: BrandingAsset["kind"]; path: string; publicUrl: string }[] = [];

  try {
    for (const asset of [input.logo, input.cover]) {
      if (!asset) continue;
      uploaded.push({ kind: asset.kind, ...await storage.upload(scope, asset, accessToken) });
    }
    const logo = uploaded.find((item) => item.kind === "logo");
    const cover = uploaded.find((item) => item.kind === "cover");
    const update: LeagueBrandingUpdate = {
      accentColor: input.accentColor,
      ...(input.removeLogo ? { logoUrl: null } : logo ? { logoUrl: logo.publicUrl } : {}),
      ...(input.removeCover ? { coverUrl: null } : cover ? { coverUrl: cover.publicUrl } : {}),
    };
    await repository.update(scope, update, actor);

    const previousPaths = [
      update.logoUrl !== undefined ? storage.pathFromPublicUrl(current.logoUrl) : null,
      update.coverUrl !== undefined ? storage.pathFromPublicUrl(current.coverUrl) : null,
    ].filter((path): path is string => Boolean(path)
      && path!.startsWith(`${scope}/`)
      && !uploaded.some((item) => item.path === path));
    if (previousPaths.length) await storage.remove(previousPaths, accessToken).catch(() => undefined);
    return { logoUrl: update.logoUrl, coverUrl: update.coverUrl, accentColor: update.accentColor };
  } catch (error) {
    if (uploaded.length) await storage.remove(uploaded.map((item) => item.path), accessToken).catch(() => undefined);
    throw error;
  }
}
