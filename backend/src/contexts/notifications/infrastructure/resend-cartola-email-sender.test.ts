import { describe, expect, it, vi } from "vitest";
import { resendCartolaEmailSender } from "./resend-cartola-email-sender.js";

const mockSend = vi.fn().mockResolvedValue({ data: { id: "resend-msg-123" }, error: null });

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

describe("resendCartolaEmailSender", () => {
  it("throws when configuration is incomplete", async () => {
    const sender = resendCartolaEmailSender({ appPublicUrl: "https://pelada.com" });
    await expect(
      sender.sendCartolaEmailTest({
        userId: "user-1",
        email: "test@pelada.com",
        name: "Testador",
      }),
    ).rejects.toThrow("Resend ou cancelamento de e-mail não configurado.");
  });

  it("sends test email using configured Resend credentials", async () => {
    const sender = resendCartolaEmailSender({
      apiKey: "re_123456789",
      fromEmail: "noreply@pelada.com",
      unsubscribeSecret: "secret-token",
      appPublicUrl: "https://pelada.com",
    });

    const result = await sender.sendCartolaEmailTest({
      userId: "user-1",
      email: "test@pelada.com",
      name: "Testador",
    });

    expect(result).toEqual({ providerMessageId: "resend-msg-123" });
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "noreply@pelada.com",
        to: ["test@pelada.com"],
        subject: expect.stringContaining("Teste"),
      }),
      expect.objectContaining({
        idempotencyKey: expect.stringContaining("cartola-test-user-1"),
      }),
    );
  });
});
