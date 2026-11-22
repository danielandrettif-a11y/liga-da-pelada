import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { pgCartolaReminderRepository } from "./pg-cartola-reminder-repository.js";
import { NotificationPersistenceError } from "./pg-inbox-repository.js";

describe("pgCartolaReminderRepository", () => {
  const leagueId = "00000000-0000-4000-8000-000000000001";
  const actor = { userId: "00000000-0000-4000-8000-000000000002" };

  it("toggles reminders when user is league admin and email test exists", async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes("is_league_admin")) return { rows: [{ allowed: true }] };
      if (sql.includes("SELECT cartola_email_tested_at")) return { rows: [{ cartola_email_tested_at: "2026-10-29T00:00:00Z" }] };
      if (sql.includes("UPDATE public.leagues")) return { rows: [] };
      if (sql.includes("FROM public.rounds r")) return { rows: [{ id: "round-1", date: "2026-11-01", start_time: "08:00" }] };
      return { rows: [] };
    });

    const pool = {
      connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }),
      query,
    } as unknown as Pool;

    const repo = pgCartolaReminderRepository(pool);
    const result = await repo.toggleReminders(leagueId, true, actor);

    expect(result.enabled).toBe(true);
    expect(result.activeRoundToSchedule?.id).toBe("round-1");
  });

  it("rejects toggle when email test was never performed", async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes("is_league_admin")) return { rows: [{ allowed: true }] };
      if (sql.includes("SELECT cartola_email_tested_at")) return { rows: [{ cartola_email_tested_at: null }] };
      return { rows: [] };
    });

    const pool = {
      connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }),
      query,
    } as unknown as Pool;

    const repo = pgCartolaReminderRepository(pool);
    await expect(repo.toggleReminders(leagueId, true, actor)).rejects.toThrow(
      "Envie e confirme primeiro o teste no seu e-mail.",
    );
  });

  it("cancels email reminders for a user", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;

    const repo = pgCartolaReminderRepository(pool);
    const result = await repo.cancelEmailReminders("user-1");

    expect(result).toBe(true);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO public.user_notification_preferences"),
      ["user-1"],
    );
  });

  it("claims delivery atomically", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: "delivery-1" }] });
    const pool = { query } as unknown as Pool;

    const repo = pgCartolaReminderRepository(pool);
    const result = await repo.claimDelivery({
      leagueId,
      roundId: "round-1",
      userId: "user-1",
      milestone: "24h",
      channel: "push",
    });

    expect(result).toBe(true);
  });
});

