import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/351_split_fantasy_pass_link_triggers.sql"),
  "utf8",
);

describe("separação dos gatilhos do Passe BQ", () => {
  it("usa uma função exclusiva para eventos e outra para a lojinha", () => {
    expect(migration).toContain("validate_fantasy_pass_event_link()");
    expect(migration).toContain("validate_fantasy_pass_shop_link()");
    expect(migration).toContain("EXECUTE FUNCTION public.validate_fantasy_pass_event_link()");
    expect(migration).toContain("EXECUTE FUNCTION public.validate_fantasy_pass_shop_link()");
  });

  it("remove a função compartilhada incompatível", () => {
    expect(migration).toContain("DROP FUNCTION IF EXISTS public.validate_fantasy_pass_links()");
  });
});
