import { describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { registerCartolaReminderRoutes } from "./cartola-reminder-route.js";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import type {
  CartolaReminderApplicationService,
  CartolaReminderScheduler,
} from "../application/manage-cartola-reminders.js";

function buildApp(options: {
  verifier?: UserVerifier;
  cartolaService?: Partial<CartolaReminderApplicationService>;
  scheduler?: Partial<CartolaReminderScheduler>;
  webhookSecret?: string;
} = {}) {
  const app = Fastify();
  const verifier: UserVerifier = options.verifier || {
    verifyAccessToken: vi.fn(async (token: string) => {
      if (token === "valid-token") {
        return { userId: "00000000-0000-4000-8000-000000000001" };
      }
      return null;
    }),
  };

  const cartolaService = {
    toggleReminders: vi.fn(async () => ({ success: true })),
    cancelEmailReminders: vi.fn(async () => ({ success: true })),
    dispatchCartolaReminder: vi.fn(async () => ({ sent: 3 })),
    ...options.cartolaService,
  } as unknown as CartolaReminderApplicationService;

  const scheduler = {
    scheduleReminderJob: vi.fn(async () => ({ scheduled: true })),
    scheduleRoundReminders: vi.fn(async () => ({ scheduled: 2 })),
    ...options.scheduler,
  } as unknown as CartolaReminderScheduler;

  registerCartolaReminderRoutes(app, {
    verifier,
    cartolaService,
    scheduler,
    webhookSecret: options.webhookSecret || "webhook-secret-123",
  });

  return { app, cartolaService, scheduler, verifier };
}

describe("Cartola Reminder Fastify routes", () => {
  describe("POST /api/notifications/cartola/reminders/toggle", () => {
    it("returns 401 when Authorization header is missing", async () => {
      const { app } = buildApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/notifications/cartola/reminders/toggle",
        payload: { leagueId: "league-1", enabled: true },
      });
      expect(response.statusCode).toBe(401);
    });

    it("toggles reminders when authenticated as admin", async () => {
      const { app, cartolaService } = buildApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/notifications/cartola/reminders/toggle",
        headers: { authorization: "Bearer valid-token" },
        payload: { leagueId: "league-1", enabled: true },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });
      expect(cartolaService.toggleReminders).toHaveBeenCalledWith("league-1", true, {
        userId: "00000000-0000-4000-8000-000000000001",
      });
    });
  });

  describe("POST /api/notifications/cartola/reminders/cancel", () => {
    it("cancels email reminders without user session using signature token", async () => {
      const { app, cartolaService } = buildApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/notifications/cartola/reminders/cancel",
        payload: { userId: "user-123", token: "valid-hmac-token" },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });
      expect(cartolaService.cancelEmailReminders).toHaveBeenCalledWith("user-123", "valid-hmac-token");
    });

    it("returns 400 when parameters are missing", async () => {
      const { app } = buildApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/notifications/cartola/reminders/cancel",
        payload: { userId: "user-123" },
      });
      expect(response.statusCode).toBe(400);
    });
  });

  describe("POST /api/internal/notifications/cartola-reminder", () => {
    it("returns 401 when webhook secret is invalid", async () => {
      const { app } = buildApp({ webhookSecret: "valid-secret" });
      const response = await app.inject({
        method: "POST",
        url: "/api/internal/notifications/cartola-reminder",
        headers: { authorization: "Bearer wrong-secret" },
        payload: { roundId: "round-1" },
      });
      expect(response.statusCode).toBe(401);
    });

    it("returns skipped on obsolete milestones", async () => {
      const { app } = buildApp({ webhookSecret: "valid-secret" });
      const response = await app.inject({
        method: "POST",
        url: "/api/internal/notifications/cartola-reminder",
        headers: { authorization: "Bearer valid-secret" },
        payload: { roundId: "round-1", milestone: "opening" },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ skipped: "obsolete-milestone" });
    });

    it("dispatches reminder when target is within 15 seconds", async () => {
      const { app, cartolaService } = buildApp({ webhookSecret: "valid-secret" });
      const nowIso = new Date().toISOString();
      const response = await app.inject({
        method: "POST",
        url: "/api/internal/notifications/cartola-reminder",
        headers: { authorization: "Bearer valid-secret" },
        payload: {
          roundId: "round-1",
          milestone: "24h",
          targetAt: nowIso,
          roundStartAt: nowIso,
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ sent: 3 });
      expect(cartolaService.dispatchCartolaReminder).toHaveBeenCalled();
    });

    it("relays reminder job when remaining time is greater than 15 seconds", async () => {
      const { app, scheduler } = buildApp({ webhookSecret: "valid-secret" });
      const futureIso = new Date(Date.now() + 60_000).toISOString();
      const response = await app.inject({
        method: "POST",
        url: "/api/internal/notifications/cartola-reminder",
        headers: { authorization: "Bearer valid-secret" },
        payload: {
          roundId: "round-1",
          milestone: "24h",
          targetAt: futureIso,
          roundStartAt: futureIso,
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ relayed: true });
      expect(scheduler.scheduleReminderJob).toHaveBeenCalled();
    });
  });
});

