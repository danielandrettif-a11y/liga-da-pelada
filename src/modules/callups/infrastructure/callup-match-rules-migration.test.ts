import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/358_callup_match_rules.sql"),
  "utf8",
);

describe("migration 358: regras por convocação", () => {
  it("aceita zero como opção sem limite e mantém duração válida", () => {
    expect(migration).toContain("CHECK (goals_to_finish BETWEEN 0 AND 20)");
    expect(migration).toContain("CHECK (match_duration BETWEEN 1 AND 90)");
  });

  it("copia as regras da convocação para cada nova partida", () => {
    expect(migration).toContain("CREATE TRIGGER snapshot_match_callup_rules_on_insert");
    expect(migration).toContain("NEW.duration_seconds := COALESCE(callup_duration, league_duration, 7) * 60");
    expect(migration).toContain("NEW.goals_to_finish := COALESCE(callup_goal_target, league_goal_target");
  });

  it("trava alterações depois do início da primeira partida", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.update_callup_match_rules");
    expect(migration).toContain("match_item.started_at IS NOT NULL");
    expect(migration).toContain("status IN ('live', 'in_progress', 'finished')");
  });
});
