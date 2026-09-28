import { describe, expect, it } from "vitest";
import { canUseCollective } from "./collective-access";

describe("canUseCollective", () => {
  it("libera jogadores oficiais e administradores, mas recusa convidados", () => {
    expect(canUseCollective(false, "player")).toBe(true);
    expect(canUseCollective(true, "guest")).toBe(true);
    expect(canUseCollective(false, "guest")).toBe(false);
  });
});
