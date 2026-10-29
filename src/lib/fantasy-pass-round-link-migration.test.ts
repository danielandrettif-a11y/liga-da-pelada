import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/350_repair_fantasy_pass_round_link_trigger.sql"),
  "utf8",
);

describe("reparo do gatilho de vínculo do Passe BQ", () => {
  it("garante a coluna da rodada antes de recriar o gatilho", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS source_round_id");
    expect(migration).toContain("BEFORE INSERT OR UPDATE OF fantasy_season_id, source_round_id");
  });

  it("remove vínculos antigos e recria somente os dois gatilhos esperados", () => {
    expect(migration).toContain("trigger_row.tgfoid = 'public.validate_fantasy_pass_links()'::regprocedure");
    expect(migration).toContain("ON public.fantasy_season_pass_events");
    expect(migration).toContain("ON public.fantasy_season_pass_shop_items");
  });
});
