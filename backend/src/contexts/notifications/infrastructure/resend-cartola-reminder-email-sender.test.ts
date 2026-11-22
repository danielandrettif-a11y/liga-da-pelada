import { describe, expect, it, vi } from "vitest";
import { resendCartolaReminderEmailSender } from "./resend-cartola-reminder-email-sender.js";

const mockSend = vi.fn().mockResolvedValue({ data: { id: "resend-msg-reminder-1" }, error: null });

vi.mock("resend", () => {
  return {
    Resend: class {
      apiKey: string;
      emails = {
        send: mockSend,
      };
      constructor(apiKey: string) {
        this.apiKey = apiKey;
      }
    },
  };
});

describe("resendCartolaReminderEmailSender", () => {
  it("throws when credentials are missing", async () => {
    const sender = resendCartolaReminderEmailSender({ appPublicUrl: "https://pelada.com" });
    await expect(
      sender.sendReminderEmail({
        userId: "user-1",
        email: "user@pelada.com",
        name: "Jogador",
        roundId: "round-1",
        roundNumber: 1,
        date: "2026-11-01",
        startTime: "08:00",
        milestone: "24h",
      }),
    ).rejects.toThrow("Resend ou cancelamento de e-mail não configurado.");
  });

  it("sends reminder email with idempotent milestone key", async () => {
    const sender = resendCartolaReminderEmailSender({
      apiKey: "re_key_123",
      fromEmail: "noreply@pelada.com",
      unsubscribeSecret: "secret-token",
      appPublicUrl: "https://pelada.com",
    });

    const id = await sender.sendReminderEmail({
      userId: "user-1",
      email: "user@pelada.com",
      name: "Jogador",
      roundId: "round-1",
      roundNumber: 1,
      date: "2026-11-01",
      startTime: "08:00",
      milestone: "24h",
    });

    expect(id).toBe("resend-msg-reminder-1");
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["user@pelada.com"],
        subject: "Falta 1 dia: escale seu time no Cartola",
      }),
      expect.objectContaining({
        idempotencyKey: "cartola-round-1-user-1-24h",
      }),
    );
  });
});

