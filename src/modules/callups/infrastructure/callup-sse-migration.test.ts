import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(
  process.cwd(),
  "supabase/migrations/374_callup_sse_notifications.sql",
), "utf8").replace(/\r\n/g, "\n");

describe("migration 374: callup SSE notifications", () => {
  it("publishes committed entry and callup changes on a scoped channel", () => {
    expect(migration).toContain("pg_notify('callup_changes'");
    expect(migration).toContain("AFTER INSERT OR UPDATE OR DELETE ON public.callup_entries");
    expect(migration).toContain("AFTER INSERT OR UPDATE ON public.callups");
    expect(migration).toContain("'leagueId', target_league_id");
    expect(migration).toContain("'callupId', target_callup_id");
  });
});
