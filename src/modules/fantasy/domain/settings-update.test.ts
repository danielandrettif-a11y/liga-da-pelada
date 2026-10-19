import { describe, expect, it } from "vitest";
import { buildFantasySettingsPayload } from "./settings-update";

describe("buildFantasySettingsPayload", () => {
  it("bloqueia alteração isolada dos scouts canônicos", () => {
    expect(buildFantasySettingsPayload({ goalPoints: 9 })).toHaveProperty("error");
  });

  it("remove campos legados e converte campos de defensor", () => {
    expect(buildFantasySettingsPayload({
      attackerGoalPoints: 4,
      defenderOneGoalConcededPoints: -1,
      defenderTwoGoalsConcededPoints: -2,
      captainMultiplier: 2,
    })).toEqual({ payload: {
      defender_one_goal_conceded_points: -1,
      defender_two_goals_conceded_points: -2,
      captainMultiplier: 2,
    } });
  });
});
