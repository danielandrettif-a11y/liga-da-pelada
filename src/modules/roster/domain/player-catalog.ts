import type { Player } from "@/lib/types";

export type RosterPlayer = Player;

const profiles = new Set(["offensive", "midfield", "defensive"]);
const categories = new Set(["player", "guest", "wag", "supporter"]);
const seedModes = new Set(["legacy_tag", "observed"]);
const registrationSources = new Set(["legacy", "site_signup", "admin"]);
const profileScopes = new Set(["persistent", "quick_session"]);

function nullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

export function isRosterPlayer(value: unknown): value is RosterPlayer {
  if (!value || typeof value !== "object") return false;
  const player = value as Record<string, unknown>;
  return typeof player.id === "string" && typeof player.name === "string"
    && nullableString(player.nickname) && nullableString(player.profile_bio)
    && nullableString(player.avatar_url) && nullableString(player.avatar_alternate_url)
    && (player.player_profile === null || profiles.has(String(player.player_profile)))
    && (player.initial_player_profile === null || profiles.has(String(player.initial_player_profile)))
    && (player.profile_decision_source === null
      || player.profile_decision_source === "initial" || player.profile_decision_source === "overall")
    && nullableString(player.profile_source_round_id)
    && Array.isArray(player.overall_traits) && player.overall_traits.every((trait) => profiles.has(String(trait)))
    && seedModes.has(String(player.overall_seed_mode))
    && typeof player.is_goalkeeper === "boolean" && categories.has(String(player.member_category))
    && typeof player.is_selectable === "boolean" && typeof player.is_competitive_profile_complete === "boolean"
    && typeof player.show_fitness_stats === "boolean"
    && registrationSources.has(String(player.registration_source))
    && profileScopes.has(String(player.profile_scope))
    && nullableString(player.created_by_user_id) && typeof player.created_at === "string";
}
