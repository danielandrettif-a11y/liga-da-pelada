import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/347_provisional_match_kickoff.sql"),
  "utf8",
);

describe("migration do primeiro apito provisório", () => {
  it("mantém o contrato antigo e adiciona o horário do cliente", () => {
    expect(migration).toContain("p_client_started_at timestamptz");
    expect(migration).toContain("receipt := public.create_live_match(");
    expect(migration).toContain("receipt->>'idempotent'");
  });

  it("saneia o relógio e atualiza os dois marcos do cronômetro", () => {
    expect(migration).toContain("server_now - interval '15 seconds'");
    expect(migration).toContain("LEAST(server_now, p_client_started_at)");
    expect(migration).toContain("started_at = official_kickoff_at");
    expect(migration).toContain("timer_started_at = official_kickoff_at");
  });
});
