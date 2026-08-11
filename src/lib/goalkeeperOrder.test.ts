import { describe, expect, it } from "vitest";
import { drawGoalkeeperOrder } from "./goalkeeperOrder";

describe("sorteio da ordem de goleiros", () => {
  it("atribui uma posicao unica de 1 ate o tamanho do time", () => {
    const entries = drawGoalkeeperOrder(["a", "b", "c", "d", "e"], () => 0.25);

    expect(entries.map((entry) => entry.order).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(entries.map((entry) => entry.playerId))).toEqual(new Set(["a", "b", "c", "d", "e"]));
  });

  it("nao altera a ordem original recebida", () => {
    const players = ["a", "b", "c"];
    drawGoalkeeperOrder(players, () => 0);
    expect(players).toEqual(["a", "b", "c"]);
  });
});
