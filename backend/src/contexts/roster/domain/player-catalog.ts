export type PlayerProfile = "offensive" | "midfield" | "defensive";
export type OverallSeedMode = "legacy_tag" | "observed";
export type MemberCategory = "player" | "guest" | "wag" | "supporter";
export type RegistrationSource = "legacy" | "site_signup" | "admin";

export type RosterPlayer = {
  id: string;
  name: string;
  nickname: string | null;
  profile_bio: string | null;
  avatar_url: string | null;
  avatar_alternate_url: string | null;
  player_profile: PlayerProfile | null;
  initial_player_profile: PlayerProfile | null;
  profile_decision_source: "initial" | "overall" | null;
  profile_source_round_id: string | null;
  overall_traits: PlayerProfile[];
  overall_seed_mode: OverallSeedMode;
  is_goalkeeper: boolean;
  member_category: MemberCategory;
  is_selectable: boolean;
  is_competitive_profile_complete: boolean;
  show_fitness_stats: boolean;
  registration_source: RegistrationSource;
  profile_scope: "persistent" | "quick_session";
  created_by_user_id: string | null;
  created_at: string;
};

export type PlayerCatalogRecord = Omit<
  RosterPlayer,
  "player_profile" | "initial_player_profile" | "overall_traits" | "overall_seed_mode" | "is_competitive_profile_complete"
> & {
  player_profile: PlayerProfile | null;
  initial_player_profile: PlayerProfile | null;
  overall_traits: PlayerProfile[];
  overall_seed_mode: OverallSeedMode;
  league_player_profile: PlayerProfile | null;
  league_initial_player_profile: PlayerProfile | null;
  league_overall_traits: PlayerProfile[];
  league_overall_seed_mode: OverallSeedMode;
};

export class InvalidPlayerCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPlayerCatalogError";
  }
}

export function parsePlayerCatalogUuid(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalized)) {
    throw new InvalidPlayerCatalogError(`${label} inválido.`);
  }
  return normalized;
}

function normalizedTraits(values: readonly PlayerProfile[]): PlayerProfile[] {
  return [...new Set(values)].slice(0, 2);
}

export function playerFromCatalogRecord(record: PlayerCatalogRecord): RosterPlayer {
  const playerProfile = record.league_player_profile ?? record.player_profile;
  const initialPlayerProfile = record.league_initial_player_profile
    ?? playerProfile
    ?? record.initial_player_profile
    ?? record.player_profile;
  const overallTraits = normalizedTraits(
    record.league_overall_traits,
  );
  const {
    league_player_profile: _leaguePlayerProfile,
    league_initial_player_profile: _leagueInitialPlayerProfile,
    league_overall_traits: _leagueOverallTraits,
    league_overall_seed_mode: _leagueOverallSeedMode,
    ...identity
  } = record;
  return {
    ...identity,
    player_profile: playerProfile,
    initial_player_profile: initialPlayerProfile,
    overall_traits: overallTraits,
    overall_seed_mode: record.league_overall_seed_mode ?? record.overall_seed_mode,
    is_competitive_profile_complete: record.member_category === "player"
      && record.is_selectable
      && record.name.trim().length > 0
      && Boolean(record.avatar_url?.trim())
      && (playerProfile === "defensive" || playerProfile === "offensive")
      && overallTraits.length >= 1
      && overallTraits.length <= 2,
  };
}

export function orderedPlayers(
  records: readonly PlayerCatalogRecord[], selectableOnly: boolean,
): RosterPlayer[] {
  return records
    .map(playerFromCatalogRecord)
    .filter((player) => !selectableOnly || (
      player.is_selectable && (player.member_category === "player" || player.member_category === "guest")
    ))
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
}
