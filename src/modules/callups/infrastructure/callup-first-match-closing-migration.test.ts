import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(
  process.cwd(),
  "supabase/migrations/351_restore_callup_close_on_first_match.sql",
), "utf8").replace(/\r\n/g, "\n");

describe("fechamento da convocação no primeiro jogo", () => {
  it("aceita open e converted antes do jogo, inclusive sem sorteio", () => {
    expect(migration).toContain("status NOT IN ('open', 'converted')");
    expect(migration).toContain("confirmed_count < current_callup.capacity");
    expect(migration).toContain("has_drawn_teams boolean := false");
  });

  it("bloqueia qualquer inclusão quando a primeira partida iniciou", () => {
    expect(migration).toContain("match_item.started_at IS NOT NULL");
    expect(migration).toContain("match_item.status IN ('in_progress', 'live', 'finished')");
    expect(migration).toContain("A convocacao foi encerrada porque o primeiro jogo ja comecou");
  });
});
