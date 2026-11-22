import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { pgNotificationPreferencesRepository } from "./pg-notification-preferences-repository.js";

describe("pgNotificationPreferencesRepository", () => {
  const userId = "00000000-0000-4000-8000-000000000001";
  const leagueId = "00000000-0000-4000-8000-000000000002";

  it("queries preferences and league settings", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM public.user_notification_preferences")) {
        return {
          rows: [
            {
              match_push_enabled: true,
              callup_push_enabled: false,
              cartola_push_enabled: true,
              cartola_email_enabled: false,
              collective_push_enabled: true,
            },
          ],
        };
      }
      if (sql.includes("FROM public.leagues")) {
        return {
          rows: [
            {
              cartola_reminders_enabled: true,
              cartola_email_tested_at: "2026-10-29T10:00:00Z",
            },
          ],
        };
      }
      return { rows: [] };
    });

    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repo = pgNotificationPreferencesRepository(pool);

    const { preference, leagueSettings } = await repo.getPreferences(userId, leagueId);
    expect(preference?.callup_push_enabled).toBe(false);
    expect(leagueSettings?.cartola_reminders_enabled).toBe(true);
  });

  it("updates preferences with upsert on user_id", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repo = pgNotificationPreferencesRepository(pool);

    const result = await repo.updatePreferences(userId, {
      matchPushEnabled: true,
      callupPushEnabled: true,
      cartolaPushEnabled: true,
      cartolaEmailEnabled: true,
      collectivePushEnabled: true,
    });

    expect(result).toBe(true);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("ON CONFLICT (user_id) DO UPDATE SET"),
      [userId, true, true, true, true, true],
    );
  });
});

