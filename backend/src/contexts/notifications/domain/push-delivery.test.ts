import { describe, expect, it } from "vitest";
import { buildPushTestPayload } from "./push-delivery.js";

describe("push delivery domain", () => {
  it("builds the canonical push test payload with predictable tag and destination", () => {
    const payload = buildPushTestPayload("user-123");
    expect(payload.tag).toBe("push-test-user-123");
    expect(payload.title).toBe("Notificações ativadas!");
    expect(payload.url).toBe("/mais/notificacoes");
    expect(payload.body).toContain("Este é um teste");
  });
});

