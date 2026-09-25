export type ManagerConfig = { url: string; key: string };

export function readManagerConfig(env: Record<string, string | undefined>): ManagerConfig | null {
  const url = env.BQ_MANAGER_SUPABASE_URL;
  const key = env.BQ_MANAGER_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const gameUrl = new URL(url);
  const appUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  if (appUrl && gameUrl.origin === new URL(appUrl).origin) {
    throw new Error("O BQ Manager precisa de um projeto Supabase separado.");
  }
  if (!['https:', 'http:'].includes(gameUrl.protocol)) throw new Error("URL do BQ Manager inválida.");
  return { url: gameUrl.origin, key };
}
