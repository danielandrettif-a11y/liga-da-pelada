import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { pgLeagueNotificationSettingsRepository } from "./pg-league-notification-settings-repository.js";
import { NotificationPersistenceError } from "./pg-inbox-repository.js";

describe("pgLeagueNotificationSettingsRepository", () => {
  const leagueId = "00000000-0000-4000-8000-000000000001";
  const actor = {
    userId: "00000000-0000-4000-8000-000000000002",
    email: "admin@pelada.com",
  };

  it("authorizes the league admin and resolves the recipient from trusted database data", async () => {
    const transactionQuery = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes("is_league_admin")) return { rows: [{ allowed: true }] };
      if (sql.includes("account_profiles")) return { rows: [{ name: "Capitão BQ" }] };
      return { rows: [] };
    });
    const pool = {
      connect: vi.fn().mockResolvedValue({ query: transactionQuery, release: vi.fn() }),
    } as unknown as Pool;

    const result = await pgLeagueNotificationSettingsRepository(pool)
      .getEmailTestRecipient(leagueId, actor);

    expect(result).toEqual({ email: "admin@pelada.com", name: "Capitão BQ" });
  });

  it("does not read the identity table when the caller is not a league admin", async () => {
    const transactionQuery = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes("is_league_admin")) return { rows: [{ allowed: false }] };
      return { rows: [] };
    });
    const pool = {
      connect: vi.fn().mockResolvedValue({ query: transactionQuery, release: vi.fn() }),
    } as unknown as Pool;

    await expect(
      pgLeagueNotificationSettingsRepository(pool).getEmailTestRecipient(leagueId, actor),
    ).rejects.toThrow("Somente administradores podem executar o teste.");
  });

  it("updates cartola_email_tested_at when user is league admin", async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes("is_league_admin")) {
        return { rows: [{ allowed: true }] };
      }
      return { rows: [] };
    });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repo = pgLeagueNotificationSettingsRepository(pool);

    const testedAt = new Date().toISOString();
    const result = await repo.recordEmailTestedAt(leagueId, actor, testedAt);
    expect(result).toBe(true);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE public.leagues"),
      [leagueId, testedAt],
    );
  });

  it("rejects when user is not league admin", async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes("is_league_admin")) {
        return { rows: [{ allowed: false }] };
      }
      return { rows: [] };
    });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repo = pgLeagueNotificationSettingsRepository(pool);

    await expect(
      repo.recordEmailTestedAt(leagueId, actor, new Date().toISOString()),
    ).rejects.toThrow(NotificationPersistenceError);
  });
});

