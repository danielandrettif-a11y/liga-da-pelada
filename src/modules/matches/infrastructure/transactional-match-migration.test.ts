import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/334_transactional_idempotent_match_creation.sql"),
  "utf8",
);

describe("migration de abertura transacional da partida", () => {
  it("mantém criação, escalação e goleiros na mesma função SQL", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.create_live_match");
    expect(migration).toContain("INSERT INTO public.matches");
    expect(migration).toContain("INSERT INTO public.match_players");
    expect(migration).toContain("INSERT INTO public.match_goalkeepers");
    expect(migration).toContain("INSERT INTO public.match_goalkeeper_stints");
    expect(migration).toMatch(/^BEGIN;[\s\S]*COMMIT;\s*$/m);
  });

  it("autoriza pela pelada e protege repetição e concorrência", () => {
    expect(migration).toContain("public.is_league_admin(selected_round.league_id)");
    expect(migration).toContain("matches_creation_idempotency_unique");
    expect(migration).toContain("creation_request_hash");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain(") FROM PUBLIC, anon;");
    expect(migration).toMatch(/\) TO authenticated;\s+NOTIFY pgrst/);
  });

  it("não mistura integração externa na transação do banco", () => {
    expect(migration).not.toMatch(/qstash|fetch\s*\(|http_request|net\.http/i);
  });
});
