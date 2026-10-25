import { describe, expect, it, vi } from "vitest";
import { registerGoal, type GoalRepository } from "./register-goal.js";

const validCommand = {
  matchId: "00000000-0000-4000-8000-000000000001",
  playerId: "00000000-0000-4000-8000-000000000002",
  teamId: "00000000-0000-4000-8000-000000000003",
  idempotencyKey: "goal-1",
};

describe("registerGoal", () => {
  it("passes a validated command and verified actor to the repository", async () => {
    const receipt = {
      event_id: "00000000-0000-4000-8000-000000000004",
      idempotent: false,
      score_a: 1,
      score_b: 0,
      round_id: "00000000-0000-4000-8000-000000000005",
    };
    const repository: GoalRepository = { registerGoal: vi.fn().mockResolvedValue(receipt) };
    const actor = { userId: "00000000-0000-4000-8000-000000000006" };
    await expect(registerGoal(validCommand, actor, repository)).resolves.toEqual(receipt);
    expect(repository.registerGoal).toHaveBeenCalledExactlyOnceWith(validCommand, actor);
  });

  it("rejects invalid events before touching storage", async () => {
    const repository: GoalRepository = { registerGoal: vi.fn() };
    await expect(registerGoal({ ...validCommand, minute: -1 }, { userId: "actor" }, repository))
      .rejects.toThrow("Minuto inválido");
    await expect(registerGoal({ ...validCommand, assistPlayerId: validCommand.playerId }, { userId: "actor" }, repository))
      .rejects.toThrow("próprio gol");
    expect(repository.registerGoal).not.toHaveBeenCalled();
  });
});
