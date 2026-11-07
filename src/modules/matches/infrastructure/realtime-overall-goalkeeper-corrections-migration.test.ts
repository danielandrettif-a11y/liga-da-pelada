import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(
  process.cwd(),
  "supabase/migrations/354_realtime_callups_overall_and_goalkeeper_corrections.sql",
), "utf8").replace(/\r\n/g, "\n");

describe("migration 354: tempo real, OVR e correção de goleiro", () => {
  it("publica a convocação em tempo real com dados de DELETE", () => {
    expect(migration).toContain("ALTER TABLE public.callup_entries REPLICA IDENTITY FULL");
    expect(migration).toContain("ALTER PUBLICATION supabase_realtime ADD TABLE public.callup_entries");
  });

  it("isola os campos específicos de snapshot e auditoria do OVR", () => {
    expect(migration).toMatch(/TG_TABLE_NAME = 'player_overall_round_breakdowns'[\s\S]*NEW\.round_id/);
    expect(migration).toMatch(/TG_TABLE_NAME = 'player_overall_snapshots'[\s\S]*NEW\.last_round_id/);
    expect(migration).not.toMatch(/TG_TABLE_NAME = 'player_overall_snapshots'[\s\S]{0,500}NEW\.round_id/);
  });

  it("corrige goleiro finalizado e os snapshots dos gols na mesma transação", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.correct_finished_match_goalkeeper");
    expect(migration).toContain("current_match.status <> 'finished'");
    expect(migration).toContain("DELETE FROM public.match_goalkeeper_stints");
    expect(migration).toContain("SET goalkeeper_a_player_id = p_player_id");
    expect(migration).toContain("SET goalkeeper_b_player_id = p_player_id");
    expect(migration).toMatch(/^BEGIN;[\s\S]*COMMIT;\s*$/m);
  });
});
