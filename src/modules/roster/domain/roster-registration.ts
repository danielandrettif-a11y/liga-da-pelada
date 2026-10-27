import type { PlayerRegistrationEvent } from "@/lib/types";

const categories = new Set(["player", "guest", "wag", "supporter"]);
const sources = new Set(["legacy", "site_signup", "admin"]);

function nullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

export function isPlayerRegistrationEvent(value: unknown): value is PlayerRegistrationEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  return Number.isInteger(event.id) && Number(event.id) >= 0
    && nullableString(event.player_id) && typeof event.player_name === "string"
    && nullableString(event.avatar_url) && categories.has(String(event.member_category))
    && sources.has(String(event.source)) && nullableString(event.created_by_user_id)
    && typeof event.created_at === "string";
}
