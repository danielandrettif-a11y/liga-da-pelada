import { describe, expect, it } from "vitest";
import {
  createLiveGoalOutboxItem,
  enqueueLiveGoal,
  getLiveGoalOutboxScoreDelta,
  liveGoalOutboxItemToOptimisticEvent,
  loadLiveGoalOutbox,
  reconcileLiveGoalOutbox,
  removeLiveGoalOutboxItem,
  saveLiveGoalOutbox,
  updateLiveGoalOutboxItem,
  type LiveGoalOutboxStorage,
} from "./live-goal-outbox";

function memoryStorage(): LiveGoalOutboxStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

function item(key = "goal-key", matchId = "match-a") {
  return createLiveGoalOutboxItem({
    match_id: matchId,
    player_id: "player-a",
    assist_player_id: "player-b",
    team_id: "team-a",
    minute: 4,
    idempotency_key: key,
  }, {
    scorerName: "Ana",
    assistName: "Bia",
    createdAt: "2026-10-21T12:00:00.000Z",
  });
}

describe("live goal outbox", () => {
  it("isola a fila por usuário e partida", () => {
    const storage = memoryStorage();
    saveLiveGoalOutbox(storage, "user-a", "match-a", [item()]);

    expect(loadLiveGoalOutbox(storage, "user-a", "match-a", Date.parse("2026-10-22"))).toHaveLength(1);
    expect(loadLiveGoalOutbox(storage, "user-b", "match-a", Date.parse("2026-10-22"))).toEqual([]);
    expect(loadLiveGoalOutbox(storage, "user-a", "match-b", Date.parse("2026-10-22"))).toEqual([]);
  });

  it("mantém uma única entrada e a chave idempotente imutável", () => {
    const queued = enqueueLiveGoal(enqueueLiveGoal([], item()), item());
    const retrying = updateLiveGoalOutboxItem(queued, "goal-key", {
      status: "retrying",
      attempts: 1,
      updatedAt: "2026-10-21T12:00:02.000Z",
    });

    expect(retrying).toHaveLength(1);
    expect(retrying[0].idempotencyKey).toBe("goal-key");
    expect(retrying[0].input.idempotency_key).toBe("goal-key");
    expect(retrying[0].status).toBe("retrying");
  });

  it("remove entradas confirmadas pelo realtime", () => {
    const queued = [item("one"), item("two")];
    expect(reconcileLiveGoalOutbox(queued, ["one"]).map((entry) => entry.idempotencyKey)).toEqual(["two"]);
    expect(removeLiveGoalOutboxItem(queued, "two").map((entry) => entry.idempotencyKey)).toEqual(["one"]);
  });

  it("não soma ao placar uma falha definitiva de regra de negócio", () => {
    const pending = item("pending");
    const uncertain = { ...item("uncertain"), status: "failed" as const, retryable: true };
    const rejected = { ...item("rejected"), status: "failed" as const, retryable: false };
    const otherTeam = { ...item("other"), input: { ...item("other").input, team_id: "team-b" } };

    expect(getLiveGoalOutboxScoreDelta([pending, uncertain, rejected, otherTeam], "team-a"))
      .toEqual({ a: 2, b: 1 });
  });

  it("restaura a apresentação pendente sem chamar de confirmada", () => {
    const event = liveGoalOutboxItemToOptimisticEvent({ ...item(), status: "failed", retryable: true });
    expect(event).toMatchObject({
      id: "opt-goal-key",
      idempotency_key: "goal-key",
      isOptimistic: true,
      outboxStatus: "failed",
      player: { name: "Ana" },
      assist_player: { name: "Bia" },
    });
  });

  it("ignora conteúdo inválido, de outra partida e expirado", () => {
    const storage = memoryStorage();
    saveLiveGoalOutbox(storage, "user-a", "match-a", [
      item("old"),
      { ...item("wrong"), input: { ...item("wrong").input, match_id: "match-b" } },
    ]);

    expect(loadLiveGoalOutbox(storage, "user-a", "match-a", Date.parse("2026-11-15"))).toEqual([]);
  });
});
