/** Keep the browser's Supabase cookie namespace when the server uses an internal URL. */
export function supabaseServerConfig(publicUrl: string, internalUrl?: string) {
  const projectRef = new URL(publicUrl).hostname.split(".")[0];
  return {
    url: internalUrl || publicUrl,
    cookieName: `sb-${projectRef}-auth-token`,
  };
}
