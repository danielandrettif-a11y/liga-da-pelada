import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/279_scoped_live_goal_registration.sql"),
  "utf8",
);

describe("RPC de gol no caminho crítico", () => {
  it("autoriza a pelada e grava evento + placar na mesma transação", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.register_goal");
    expect(migration).toContain("NOT public.is_league_admin(target_league_id)");
    expect(migration).toContain("INSERT INTO public.match_events");
    expect(migration).toContain("UPDATE public.matches");
    expect(migration).toContain("FOR UPDATE");
  });

  it("mantém a idempotência dentro da própria RPC", () => {
    expect(migration).toContain("idempotency_key = p_idempotency_key");
    expect(migration).toContain("'idempotent', true");
  });
});
