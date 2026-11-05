import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/359_cartola_complete_roster_and_affordability.sql"),
  "utf8",
);

describe("migration 359: elenco completo e Cartola acessível", () => {
  it("remove a janela de atividade sem contornar o perfil completo", () => {
    expect(migration).toContain("save_fantasy_lineup_with_reserve_pre_activity_251");
    expect(migration).not.toContain("recent_rounds");
    expect(migration).toContain("member.player_profile IN ('defensive', 'offensive')");
    expect(migration).toContain("cardinality(member.overall_traits)");
  });

  it("calcula e aplica o time válido mais barato como piso", () => {
    expect(migration).toContain("get_fantasy_minimum_viable_lineup_cost");
    expect(migration).toContain("formations(team_size, defenders, attackers)");
    expect(migration).toContain("GREATEST(base_budget, target_team_size * 11.00");
    expect(migration).toContain("ON CONFLICT (fantasy_season_id, user_id) DO UPDATE");
  });

  it("não muda preços individuais para dar acessibilidade", () => {
    expect(migration).not.toContain("UPDATE public.fantasy_player_prices");
  });
});
