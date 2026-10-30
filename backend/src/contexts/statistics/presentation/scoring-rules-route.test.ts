import { afterEach, describe, expect, it, vi } from "vitest";
import type { ScoringRulesRepository } from "../application/manage-scoring-rules.js";
import {
  BQ_SCORING_V5,
  DEFAULT_COLUMN_C_SCORING,
} from "../domain/scoring-policy.js";
import { ScoringRulesPersistenceError } from "../infrastructure/pg-scoring-rules-repository.js";
import { createApp } from "../../../presentation/app.js";

const apps: ReturnType<typeof createApp>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

function fixture() {
  const repository: ScoringRulesRepository = {
    getBQScoringRules: vi.fn().mockResolvedValue(BQ_SCORING_V5),
    getColumnCScoringRules: vi.fn().mockResolvedValue(DEFAULT_COLUMN_C_SCORING),
    saveBQScoringRules: vi.fn().mockResolvedValue({ success: true, version: 5 }),
    saveColumnCScoringRules: vi.fn().mockResolvedValue({
      success: true,
      roundsReprocessed: 2,
      playerRoundsReprocessed: 24,
    }),
  };

  const verifier = {
    verifyAccessToken: vi.fn().mockResolvedValue({
      userId: "00000000-0000-4000-8000-000000000001",
    }),
  };

  const app = createApp({
    goalsEnabled: false,
    statisticsEnabled: true,
    verifier,
    repository: {} as any,
    scoringRulesRepository: repository,
    logger: false,
  });
  apps.push(app);

  return { app, repository, verifier };
}

describe("scoring rules routes", () => {
  const leagueId = "00000000-0000-4000-8000-000000000002";

  it("returns 401 when Authorization header is missing", async () => {
    const { app } = fixture();
    const response = await app.inject({
      method: "GET",
      url: `/api/statistics/leagues/${leagueId}/scoring/bq`,
    });
    expect(response.statusCode).toBe(401);
  });

  it("GET /api/statistics/leagues/:leagueId/scoring/bq returns 200 with snapshot", async () => {
    const { app, repository } = fixture();
    const response = await app.inject({
      method: "GET",
      url: `/api/statistics/leagues/${leagueId}/scoring/bq`,
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(BQ_SCORING_V5);
    expect(repository.getBQScoringRules).toHaveBeenCalled();
  });

  it("GET /api/statistics/leagues/:leagueId/scoring/column-c returns 200 with settings", async () => {
    const { app, repository } = fixture();
    const response = await app.inject({
      method: "GET",
      url: `/api/statistics/leagues/${leagueId}/scoring/column-c`,
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(DEFAULT_COLUMN_C_SCORING);
    expect(repository.getColumnCScoringRules).toHaveBeenCalled();
  });

  it("PUT /api/statistics/leagues/:leagueId/scoring/bq returns 200 when snapshot is valid", async () => {
    const { app, repository } = fixture();
    const response = await app.inject({
      method: "PUT",
      url: `/api/statistics/leagues/${leagueId}/scoring/bq`,
      headers: {
        authorization: "Bearer valid-token",
        "content-type": "application/json",
      },
      payload: JSON.stringify(BQ_SCORING_V5),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true, version: 5 });
    expect(repository.saveBQScoringRules).toHaveBeenCalled();
  });

  it("PUT /api/statistics/leagues/:leagueId/scoring/bq returns 400 when snapshot is invalid", async () => {
    const { app } = fixture();
    const response = await app.inject({
      method: "PUT",
      url: `/api/statistics/leagues/${leagueId}/scoring/bq`,
      headers: {
        authorization: "Bearer valid-token",
        "content-type": "application/json",
      },
      payload: JSON.stringify({ goal: "invalid" }),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("INVALID_SCORING_REQUEST");
  });

  it("PUT /api/statistics/leagues/:leagueId/scoring/column-c returns 200 when settings are valid", async () => {
    const { app, repository } = fixture();
    const response = await app.inject({
      method: "PUT",
      url: `/api/statistics/leagues/${leagueId}/scoring/column-c`,
      headers: {
        authorization: "Bearer valid-token",
        "content-type": "application/json",
      },
      payload: JSON.stringify({
        settings: DEFAULT_COLUMN_C_SCORING,
        options: { reprocessRanked: true },
      }),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      roundsReprocessed: 2,
      playerRoundsReprocessed: 24,
    });
    expect(repository.saveColumnCScoringRules).toHaveBeenCalled();
  });

  it("PUT /api/statistics/leagues/:leagueId/scoring/column-c returns 400 when conceded points are positive", async () => {
    const { app } = fixture();
    const response = await app.inject({
      method: "PUT",
      url: `/api/statistics/leagues/${leagueId}/scoring/column-c`,
      headers: {
        authorization: "Bearer valid-token",
        "content-type": "application/json",
      },
      payload: JSON.stringify({
        settings: {
          ...DEFAULT_COLUMN_C_SCORING,
          lineGoalConcededPoints: 1.5,
        },
      }),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("INVALID_SCORING_REQUEST");
  });

  it("returns 403 when repository reports non-admin permission error", async () => {
    const { app, repository } = fixture();
    vi.mocked(repository.saveBQScoringRules).mockRejectedValueOnce(
      new ScoringRulesPersistenceError(
        "Apenas administradores podem alterar as regras de pontuação.",
        403,
      ),
    );

    const response = await app.inject({
      method: "PUT",
      url: `/api/statistics/leagues/${leagueId}/scoring/bq`,
      headers: {
        authorization: "Bearer valid-token",
        "content-type": "application/json",
      },
      payload: JSON.stringify(BQ_SCORING_V5),
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("SCORING_PERSISTENCE_ERROR");
  });
});

