import { describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { registerDeliveryRoutes } from "./delivery-route.js";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import type { DeliveryApplicationService } from "../application/manage-delivery.js";

function buildApp(options: {
  verifier?: UserVerifier;
  deliveryService?: Partial<DeliveryApplicationService>;
  webhookSecret?: string;
} = {}) {
  const app = Fastify();
  const verifier: UserVerifier = options.verifier || {
    verifyAccessToken: vi.fn(async (token: string) => {
      if (token === "valid-token") {
        return {
          userId: "00000000-0000-4000-8000-000000000001",
          email: "trusted@pelada.com",
          name: "Identidade Verificada",
        };
      }
      return null;
    }),
  };

  const deliveryService = {
    schedulePushTest: vi.fn(async () => ({ scheduled: true })),
    deliverPushTestAlert: vi.fn(async () => ({ sent: 1, failed: 0 })),
    deliverMatchTimerAlert: vi.fn(async () => ({ sent: 1, failed: 0, secondsLeft: 30 })),
    sendCartolaEmailTest: vi.fn(async () => ({ success: true, testedAt: "2026-10-30T00:00:00.000Z" })),
    ...options.deliveryService,
  } as unknown as DeliveryApplicationService;

  registerDeliveryRoutes(app, {
    verifier,
    deliveryService,
    webhookSecret: options.webhookSecret || "webhook-secret-123",
  });

  return { app, deliveryService, verifier };
}

describe("Delivery Fastify routes", () => {
  describe("POST /api/notifications/test-push", () => {
    it("returns 401 when Authorization header is missing", async () => {
      const { app } = buildApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/notifications/test-push",
      });
      expect(response.statusCode).toBe(401);
    });

    it("schedules push test when authenticated", async () => {
      const { app, deliveryService } = buildApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/notifications/test-push",
        headers: { authorization: "Bearer valid-token" },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true, scheduled: true });
      expect(deliveryService.schedulePushTest).toHaveBeenCalledWith({
        userId: "00000000-0000-4000-8000-000000000001",
      });
    });
  });

  describe("POST /api/notifications/test-cartola-email", () => {
    it("returns 400 when leagueId is missing", async () => {
      const { app } = buildApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/notifications/test-cartola-email",
        headers: { authorization: "Bearer valid-token" },
        payload: {},
      });
      expect(response.statusCode).toBe(400);
    });

    it("triggers test email for admin user", async () => {
      const { app, deliveryService } = buildApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/notifications/test-cartola-email",
        headers: { authorization: "Bearer valid-token" },
        payload: {
          leagueId: "league-123",
          email: "user@pelada.com",
          name: "Jogador Teste",
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        success: true,
        testedAt: "2026-10-30T00:00:00.000Z",
      });
      expect(deliveryService.sendCartolaEmailTest).toHaveBeenCalledWith("league-123", {
        userId: "00000000-0000-4000-8000-000000000001",
        email: "trusted@pelada.com",
        name: "Identidade Verificada",
      });
    });
  });

  describe("POST /api/internal/notifications/push-test-alert", () => {
    it("returns 401 when internal webhook secret is invalid", async () => {
      const { app } = buildApp({ webhookSecret: "valid-secret" });
      const response = await app.inject({
        method: "POST",
        url: "/api/internal/notifications/push-test-alert",
        headers: { authorization: "Bearer wrong-secret" },
        payload: { userId: "00000000-0000-4000-8000-000000000001" },
      });
      expect(response.statusCode).toBe(401);
    });

    it("returns 400 when userId is not a valid UUID", async () => {
      const { app } = buildApp({ webhookSecret: "valid-secret" });
      const response = await app.inject({
        method: "POST",
        url: "/api/internal/notifications/push-test-alert",
        headers: { authorization: "Bearer valid-secret" },
        payload: { userId: "not-a-uuid" },
      });
      expect(response.statusCode).toBe(400);
    });

    it("delivers push test alert when authorized by secret", async () => {
      const { app, deliveryService } = buildApp({ webhookSecret: "valid-secret" });
      const response = await app.inject({
        method: "POST",
        url: "/api/internal/notifications/push-test-alert",
        headers: { authorization: "Bearer valid-secret" },
        payload: { userId: "00000000-0000-4000-8000-000000000001" },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true, sent: 1 });
      expect(deliveryService.deliverPushTestAlert).toHaveBeenCalledWith(
        "00000000-0000-4000-8000-000000000001",
      );
    });

    it("returns 503 when VAPID is disabled", async () => {
      const { app } = buildApp({
        webhookSecret: "valid-secret",
        deliveryService: {
          deliverPushTestAlert: vi.fn(async () => ({ sent: 0, failed: 0, disabled: true })),
        },
      });
      const response = await app.inject({
        method: "POST",
        url: "/api/internal/notifications/push-test-alert",
        headers: { authorization: "Bearer valid-secret" },
        payload: { userId: "00000000-0000-4000-8000-000000000001" },
      });
      expect(response.statusCode).toBe(503);
    });

    it("returns 502 when no subscription exists", async () => {
      const { app } = buildApp({
        webhookSecret: "valid-secret",
        deliveryService: {
          deliverPushTestAlert: vi.fn(async () => ({ sent: 0, failed: 0 })),
        },
      });
      const response = await app.inject({
        method: "POST",
        url: "/api/internal/notifications/push-test-alert",
        headers: { authorization: "Bearer valid-secret" },
        payload: { userId: "00000000-0000-4000-8000-000000000001" },
      });
      expect(response.statusCode).toBe(502);
      expect(response.json().error).toContain("Este aparelho não possui assinatura");
    });
  });

  describe("POST /api/internal/notifications/match-timer-alert", () => {
    it("rejects an invalid webhook secret", async () => {
      const { app } = buildApp({ webhookSecret: "valid-secret" });
      const response = await app.inject({
        method: "POST",
        url: "/api/internal/notifications/match-timer-alert",
        headers: { authorization: "Bearer wrong-secret" },
        payload: {
          matchId: "00000000-0000-4000-8000-000000000010",
          threshold: "thirty_seconds",
        },
      });
      expect(response.statusCode).toBe(401);
    });

    it("validates and delivers a timer alert through the notification service", async () => {
      const { app, deliveryService } = buildApp({ webhookSecret: "valid-secret" });
      const matchId = "00000000-0000-4000-8000-000000000010";
      const response = await app.inject({
        method: "POST",
        url: "/api/internal/notifications/match-timer-alert",
        headers: { authorization: "Bearer valid-secret" },
        payload: { matchId, threshold: "thirty_seconds" },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true, sent: 1, failed: 0, secondsLeft: 30 });
      expect(deliveryService.deliverMatchTimerAlert).toHaveBeenCalledWith(matchId, "thirty_seconds");
    });
  });
});
