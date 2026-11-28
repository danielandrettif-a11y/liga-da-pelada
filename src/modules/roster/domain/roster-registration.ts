import type { PlayerRegistrationEvent } from "@/lib/types";

const categories = new Set(["player", "guest", "wag", "supporter"]);
const sources = new Set(["legacy", "site_signup", "admin"]);
const origins = new Set(["self_email", "registered_by_admin", "registered_by_user", "legacy"]);

function nullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function optionalNullableString(value: unknown): boolean {
  return value === undefined || nullableString(value);
}

export function isPlayerRegistrationEvent(value: unknown): value is PlayerRegistrationEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  return Number.isInteger(event.id) && Number(event.id) >= 0
    && nullableString(event.player_id) && typeof event.player_name === "string"
    && nullableString(event.avatar_url) && categories.has(String(event.member_category))
    && sources.has(String(event.source)) && nullableString(event.created_by_user_id)
    && optionalNullableString(event.created_by_name)
    && optionalNullableString(event.created_by_avatar_url)
    && (event.origin_type === undefined || origins.has(String(event.origin_type)))
    && optionalNullableString(event.signup_email)
    && optionalNullableString(event.signup_provider)
    && typeof event.created_at === "string";
}
