import { describe, expect, it } from "vitest";
import { calculateGoalkeeperMatchScouts } from "./goalkeeper-timeline";

describe("scouts por período no gol", () => {
  const base = {
    status: "finished",
    teamAId: "a",
    teamBId: "b",
    scoreA: 0,
    scoreB: 2,
    officialElapsedSeconds: 420,
    durationSeconds: 420,
    goalkeepers: [
      { playerId: "initial", teamId: "a" },
      { playerId: "opponent", teamId: "b" },
    ],
    goalkeeperStints: [
      { playerId: "initial", teamId: "a", enteredElapsedSeconds: 0, leftElapsedSeconds: 210 },
      { playerId: "replacement", teamId: "a", enteredElapsedSeconds: 210, leftElapsedSeconds: 420 },
      { playerId: "opponent", teamId: "b", enteredElapsedSeconds: 0, leftElapsedSeconds: 420 },
    ],
  } as const;

  it("atribui gol no segundo da troca ao goleiro capturado no evento", () => {
    const stats = calculateGoalkeeperMatchScouts({
      ...base,
      events: [
        { playerId: "scorer", teamId: "b", goalkeeperAPlayerId: "initial", goalkeeperBPlayerId: "opponent" },
        { playerId: "scorer", teamId: "b", goalkeeperAPlayerId: "replacement", goalkeeperBPlayerId: "opponent" },
      ],
    });
    expect(stats.get("initial")?.goalsConceded).toBe(1);
    expect(stats.get("replacement")?.goalsConceded).toBe(1);
    expect(stats.get("opponent")?.cleanSheets).toBe(1);
  });

  it("não concede clean sheet a uma entrada de poucos segundos", () => {
    const stats = calculateGoalkeeperMatchScouts({
      ...base,
      scoreB: 0,
      goalkeeperStints: [
        { playerId: "initial", teamId: "a", enteredElapsedSeconds: 0, leftElapsedSeconds: 400 },
        { playerId: "replacement", teamId: "a", enteredElapsedSeconds: 400, leftElapsedSeconds: 420 },
      ],
      events: [],
    });
    expect(stats.get("initial")?.cleanSheets).toBe(1);
    expect(stats.get("replacement")?.goalkeeperGames).toBe(1);
    expect(stats.get("replacement")?.cleanSheets).toBe(0);
  });

  it("mantém placar histórico sem eventos no goleiro inicial", () => {
    const stats = calculateGoalkeeperMatchScouts({
      ...base,
      goalkeeperStints: [],
      events: [],
    });
    expect(stats.get("initial")?.goalsConceded).toBe(2);
  });

  it("conta scout mesmo se a troca e o gol ocorrerem no último segundo", () => {
    const stats = calculateGoalkeeperMatchScouts({
      ...base,
      scoreB: 1,
      goalkeeperStints: [
        { playerId: "initial", teamId: "a", enteredElapsedSeconds: 0, leftElapsedSeconds: 420 },
        { playerId: "replacement", teamId: "a", enteredElapsedSeconds: 420, leftElapsedSeconds: 420 },
      ],
      events: [{ playerId: "scorer", teamId: "b", goalkeeperAPlayerId: "replacement" }],
    });
    expect(stats.get("replacement")?.goalkeeperGames).toBe(1);
    expect(stats.get("replacement")?.goalsConceded).toBe(1);
  });

  it("com cronômetro zerado, conta somente o último goleiro de cada time sem eventos", () => {
    const stats = calculateGoalkeeperMatchScouts({
      ...base,
      scoreB: 0,
      officialElapsedSeconds: 0,
      goalkeeperStints: [
        { playerId: "initial", teamId: "a", enteredElapsedSeconds: 0, leftElapsedSeconds: 0, selectedAt: "2026-01-01T00:00:00Z" },
        { playerId: "replacement", teamId: "a", enteredElapsedSeconds: 0, leftElapsedSeconds: 0, selectedAt: "2026-01-01T00:01:00Z" },
        { playerId: "opponent", teamId: "b", enteredElapsedSeconds: 0, leftElapsedSeconds: 0, selectedAt: "2026-01-01T00:00:00Z" },
      ],
      events: [],
    });
    expect(stats.has("initial")).toBe(false);
    expect(stats.get("replacement")?.goalkeeperGames).toBe(1);
    expect(stats.get("opponent")?.goalkeeperGames).toBe(1);
  });
});
