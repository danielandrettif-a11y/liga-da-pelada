import { describe, expect, it } from "vitest";
import {
  FORMULA_KEY,
  buildOverallShadowAdminData,
  validateRunForPublication,
} from "./overall-shadow";

describe("Statistics Domain: overall-shadow", () => {
  it("returns empty snapshots when latestRun is null", () => {
    const result = buildOverallShadowAdminData({
      latestRun: null,
      formulaLabel: "Fórmula v20",
      pendingPlayers: [{ id: "p1", name: "Sem Tags" }],
      snapshots: [],
      breakdowns: [],
    });

    expect(result.latestRun).toBeNull();
    expect(result.pendingPlayers).toHaveLength(1);
    expect(result.snapshots).toEqual([]);
  });

  it("builds snapshot data and calculates comparison deltas", () => {
    const result = buildOverallShadowAdminData({
      latestRun: {
        id: "run-1",
        status: "succeeded",
        created_at: "2026-10-30T00:00:00Z",
        completed_at: "2026-10-30T00:05:00Z",
        error_message: null,
      },
      formulaLabel: "Fórmula v20 - Confiança Estatística",
      pendingPlayers: [],
      snapshots: [
        {
          player_id: "p1",
          player: { name: "Neymar" },
          overall: 85,
          def_overall: 40,
          ala_mei_overall: 80,
          ata_overall: 90,
          gol_overall: 30,
          confidence: 0.95,
          rounds_played: 12,
          is_provisional: false,
          is_stale: false,
          data_quality: {
            scout_totals: { goals: 15, assists: 10 },
            position_trends: { DEF: "steady", ALA_MEI: "rising", ATA: "rising", GOL: "steady" },
            effective_profile: "offensive",
            profile_source: "overall",
          },
        },
      ],
      breakdowns: [
        {
          player_id: "p1",
          round_date: "2026-10-25",
          goals: 2,
          assists: 1,
          goals_conceded: 1,
          attacking_score: 8.5,
          goal_score: 5.0,
          assist_score: 3.5,
          defensive_score: 2.0,
          timing_quality: "exact",
        },
      ],
      comparisonSnapshots: [
        {
          player_id: "p1",
          overall: 82,
          def_overall: 40,
          ala_mei_overall: 78,
          ata_overall: 88,
          gol_overall: 30,
        },
      ],
    });

    expect(result.latestRun?.formulaLabel).toBe("Fórmula v20 - Confiança Estatística");
    expect(result.snapshots).toHaveLength(1);
    const snap = result.snapshots[0];
    expect(snap.playerName).toBe("Neymar");
    expect(snap.overall).toBe(85);
    expect(snap.recentRounds).toHaveLength(1);
    expect(snap.recentRounds[0].goals).toBe(2);
    expect(snap.comparison).toEqual({
      overallDelta: 3,
      defDelta: 0,
      alaMeiDelta: 2,
      ataDelta: 2,
      golDelta: 0,
    });
  });

  it("validates run for publication correctly", () => {
    expect(validateRunForPublication(null, "f-1")).toEqual({
      valid: false,
      reason: "Execução não encontrada.",
    });

    expect(
      validateRunForPublication(
        { id: "r1", status: "succeeded", formula_version_id: "f-2" },
        "f-1",
      ),
    ).toEqual({
      valid: false,
      reason: "A execução não corresponde à fórmula v20 ativa.",
    });

    expect(
      validateRunForPublication(
        { id: "r1", status: "processing", formula_version_id: "f-1" },
        "f-1",
      ),
    ).toEqual({
      valid: false,
      reason: "Escolha um rascunho v20 concluído e ainda não publicado.",
    });

    expect(
      validateRunForPublication(
        { id: "r1", status: "succeeded", formula_version_id: "f-1" },
        "f-1",
      ),
    ).toEqual({ valid: true });
  });
});

