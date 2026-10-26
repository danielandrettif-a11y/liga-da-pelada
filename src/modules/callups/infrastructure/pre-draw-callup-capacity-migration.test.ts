import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/349_keep_pre_draw_callup_capacity.sql"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("capacidade da convocação antes do sorteio", () => {
  it("só usa as vagas dos times quando os times já existem", () => {
    expect(migration).toContain("has_drawn_teams boolean := false");
    expect(migration).toContain("SELECT 1 FROM public.teams team");
    expect(migration).toContain("IF has_drawn_teams THEN");
    expect(migration).toContain("confirmed_count < current_callup.capacity");
  });

  it("promove automaticamente quem foi enviado à fila antes do sorteio", () => {
    expect(migration).toContain("NOT EXISTS (\n        SELECT 1 FROM public.teams team");
    expect(migration).toContain("entry.status = 'waitlist'");
    expect(migration).toContain("PERFORM public.normalize_callup_positions(target.id)");
  });
});
