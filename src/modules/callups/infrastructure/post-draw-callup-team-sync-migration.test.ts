import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/348_sync_post_draw_callup_teams.sql"),
  "utf8",
);

describe("sincronização da convocação com os times após o sorteio", () => {
  it("valida o limite pelo formato preservado na rodada", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.enforce_team_player_limit()");
    expect(migration).toContain("round_item.target_players_per_team");
    expect(migration).toContain("callup.players_per_team");
    expect(migration).toContain("league.players_per_team");
  });

  it("encaixa confirmados no menor time sem ultrapassar o formato", () => {
    expect(migration).toContain("attach_confirmed_callup_player_to_team");
    expect(migration).toContain("HAVING count(team_player.id) < target_size");
    expect(migration).toContain("ORDER BY count(team_player.id), team.position, team.id");
    expect(migration).toContain("INSERT INTO public.team_players");
  });

  it("mantém a rodada e a convocação sincronizadas", () => {
    expect(migration).toContain("INSERT INTO public.round_players");
    expect(migration).toContain("target_status := CASE WHEN has_team_vacancy THEN 'confirmed' ELSE 'waitlist' END");
    expect(migration).toContain("PERFORM public.sync_converted_callup_teams(p_callup_id)");
  });

  it("não altera escalações depois que a primeira partida começou", () => {
    expect(migration).toContain("match_item.started_at IS NOT NULL");
    expect(migration).toContain("match_item.status IN ('in_progress', 'live', 'finished')");
  });

  it("repara convocações já sorteadas durante a aplicação", () => {
    expect(migration).toContain("Repara as rodadas já sorteadas");
    expect(migration).toContain("PERFORM public.sync_converted_callup_teams(target.id)");
  });
});
