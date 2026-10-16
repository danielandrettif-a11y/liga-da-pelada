export const ENTRY_FLOW_VERSION = 1;
export const ENTRY_FLOW_DONE_COOKIE = "bq_entry_flow_v1";
export const ENTRY_FLOW_PENDING_COOKIE = "bq_entry_flow_pending_v1";

export function isEntryFlowScreen(pathname: string) {
  return pathname === "/inicio"
    || pathname === "/lobby"
    || pathname.startsWith("/lobby/")
    || pathname === "/peladas";
}

export function safeEntryDestination(value: string | null | undefined) {
  const path = String(value || "");
  if (!path.startsWith("/") || path.startsWith("//")) return "/";

  const pathname = path.split("?")[0];
  if (
    pathname === "/inicio"
    || pathname === "/login"
    || pathname === "/cadastro"
    || pathname === "/lobby"
    || pathname.startsWith("/auth/")
  ) {
    return "/";
  }

  return path;
}
