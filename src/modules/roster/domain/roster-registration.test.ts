import { describe, expect, it } from "vitest";
import { isPlayerRegistrationEvent } from "./roster-registration";

const event = {
  id: 1, player_id: "player-1", player_name: "Convidado", avatar_url: null,
  member_category: "guest", source: "admin", created_by_user_id: null,
  created_at: "2026-10-20T10:00:00.000Z",
};

describe("roster registration contract", () => {
  it("accepts a complete registration event", () => expect(isPlayerRegistrationEvent(event)).toBe(true));
  it("rejects malformed history data", () => expect(isPlayerRegistrationEvent({ ...event, source: "unknown" })).toBe(false));
});
