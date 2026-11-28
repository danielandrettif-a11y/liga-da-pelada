import { describe, expect, it } from "vitest";
import { parseCallupNotification } from "./pg-callup-event-source.js";

describe("callup PostgreSQL event source", () => {
  it("parses scoped callup notifications", () => {
    expect(parseCallupNotification({
      channel: "callup_changes",
      payload: JSON.stringify({
        leagueId: "league-1",
        callupId: "callup-1",
        table: "callup_entries",
        operation: "INSERT",
        occurredAt: "2026-11-28T12:00:00.000Z",
      }),
    })).toEqual({
      leagueId: "league-1",
      callupId: "callup-1",
      table: "callup_entries",
      operation: "INSERT",
      occurredAt: "2026-11-28T12:00:00.000Z",
    });
  });

  it("ignores malformed and unrelated notifications", () => {
    expect(parseCallupNotification({ channel: "other", payload: "{}" })).toBeNull();
    expect(parseCallupNotification({ channel: "callup_changes", payload: "invalid" })).toBeNull();
  });
});
