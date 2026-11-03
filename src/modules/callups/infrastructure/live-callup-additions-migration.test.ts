import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(
  process.cwd(),
  "supabase/migrations/350_configurable_goal_target_and_live_callup_additions.sql",
), "utf8");

describe("convocação durante a rodada", () => {
  it("mantém inclusão e fila sem bloquear pela primeira partida iniciada", () => {
    const functionBody = migration.split("CREATE OR REPLACE FUNCTION public.add_player_to_callup")[1];
    expect(functionBody).toContain("status NOT IN ('open', 'converted')");
    expect(functionBody).toContain("WHEN NOT has_started_match AND has_team_vacancy THEN 'confirmed'");
    expect(functionBody).toContain("ELSE 'waitlist'");
    expect(functionBody).not.toContain("A convocacao foi encerrada porque o primeiro jogo ja comecou");
  });

  it("instala a meta de gols com padrão compatível e limite seguro", () => {
    expect(migration).toContain("goals_to_finish integer NOT NULL DEFAULT 2");
    expect(migration).toContain("CHECK (goals_to_finish BETWEEN 1 AND 20)");
  });
});
