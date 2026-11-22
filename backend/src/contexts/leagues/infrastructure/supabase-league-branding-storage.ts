import { randomUUID } from "node:crypto";
import type { LeagueBrandingStorage } from "../application/manage-league-branding.js";

const bucket = "league-branding";

export class LeagueBrandingStorageError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "LeagueBrandingStorageError";
  }
}

function baseUrl(value: string, label: string): URL {
  try {
    const parsed = new URL(value.endsWith("/") ? value : `${value}/`);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("invalid protocol");
    return parsed;
  } catch {
    throw new Error(`${label} inválida.`);
  }
}

function encodedPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function extension(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

async function storageFailure(response: Response): Promise<LeagueBrandingStorageError> {
  const payload = await response.json().catch(() => null) as { message?: unknown; error?: unknown } | null;
  const detail = typeof payload?.message === "string"
    ? payload.message
    : typeof payload?.error === "string" ? payload.error : null;
  if (response.status === 401 || response.status === 403) {
    return new LeagueBrandingStorageError("Sem permissão para alterar as imagens desta pelada.", 403);
  }
  if (response.status === 413) {
    return new LeagueBrandingStorageError("A imagem excede o limite permitido.", 413);
  }
  return new LeagueBrandingStorageError(detail || "Storage indisponível.", 503);
}

export function supabaseLeagueBrandingStorage(
  internalBase: string,
  publicBase: string,
  publishableKey: string,
  fetcher: typeof fetch = fetch,
): LeagueBrandingStorage {
  const internal = baseUrl(internalBase, "SUPABASE_INTERNAL_URL");
  const external = baseUrl(publicBase, "SUPABASE_PUBLIC_URL");

  const headers = (accessToken: string) => ({
    authorization: `Bearer ${accessToken}`,
    apikey: publishableKey,
  });

  return {
    async upload(leagueId, asset, accessToken) {
      const path = `${leagueId}/${asset.kind}-${randomUUID()}.${extension(asset.contentType)}`;
      const response = await fetcher(new URL(`storage/v1/object/${bucket}/${encodedPath(path)}`, internal), {
        method: "POST",
        headers: {
          ...headers(accessToken),
          "content-type": asset.contentType,
          "cache-control": "max-age=31536000",
          "x-upsert": "false",
        },
        body: Buffer.from(asset.bytes),
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw await storageFailure(response);
      return {
        path,
        publicUrl: new URL(`storage/v1/object/public/${bucket}/${encodedPath(path)}`, external).href,
      };
    },

    async remove(paths, accessToken) {
      if (paths.length === 0) return;
      const response = await fetcher(new URL(`storage/v1/object/${bucket}`, internal), {
        method: "DELETE",
        headers: { ...headers(accessToken), "content-type": "application/json" },
        body: JSON.stringify({ prefixes: paths }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw await storageFailure(response);
    },

    pathFromPublicUrl(url) {
      if (!url) return null;
      const marker = `/storage/v1/object/public/${bucket}/`;
      const index = url.indexOf(marker);
      if (index < 0) return null;
      try {
        return decodeURIComponent(url.slice(index + marker.length));
      } catch {
        return null;
      }
    },
  };
}
