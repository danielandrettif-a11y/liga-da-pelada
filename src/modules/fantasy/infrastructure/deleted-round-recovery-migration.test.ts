import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(
  process.cwd(),
  "supabase/migrations/373_preserve_deleted_fantasy_lineups.sql",
), "utf8").replace(/\r\n/g, "\n");

describe("migration 373: recuperação de escalações excluídas", () => {
  it("captures lineups, players and reserves before the round cascade", () => {
    expect(migration).toContain("BEFORE DELETE ON public.rounds");
    expect(migration).toContain("FROM public.fantasy_lineup_players item");
    expect(migration).toContain("FROM public.fantasy_lineup_reserves reserve");
    expect(migration).toContain("ON CONFLICT (original_round_id) DO NOTHING");
  });

  it("restores only within the same league and fantasy season", () => {
    expect(migration).toContain("AND league_id = source_snapshot.league_id");
    expect(migration).toContain("target_fantasy_round.fantasy_season_id <> source_snapshot.fantasy_season_id");
    expect(migration).toContain("public.is_league_admin(source_snapshot.league_id)");
  });

  it("supports a dry run and preserves a user's new lineup", () => {
    expect(migration).toContain("p_dry_run boolean DEFAULT true");
    expect(migration).toContain("current_lineup.user_id = source_user_id");
    expect(migration).toContain("skipped_count := skipped_count + 1");
  });
});
