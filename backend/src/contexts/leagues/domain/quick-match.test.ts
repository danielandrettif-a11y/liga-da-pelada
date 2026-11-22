import { describe, expect, it } from "vitest";
import { parseQuickMatch } from "./quick-match.js";

describe("parseQuickMatch", () => {
  it("normalizes optional venue data and fixes the supported format", () => {
    expect(parseQuickMatch({
      date: "2026-10-24", start_time: "20:30", field_name: "  Arena   BQ ", map_url: "maps.example/arena",
    })).toEqual({
      date: "2026-10-24", startTime: "20:30", fieldName: "Arena BQ",
      mapUrl: "https://maps.example/arena", playersPerTeam: 5, teamsPerRound: 3,
    });
  });

  it("rejects malformed date, time, venue and URL values", () => {
    expect(() => parseQuickMatch({ date: "24/10/2026", start_time: "20:30", field_name: "", map_url: "" })).toThrow();
    expect(() => parseQuickMatch({ date: "2026-10-24", start_time: "8pm", field_name: "", map_url: "" })).toThrow();
    expect(() => parseQuickMatch({ date: "2026-10-24", start_time: "20:30", field_name: "x", map_url: "" })).toThrow();
    expect(() => parseQuickMatch({ date: "2026-10-24", start_time: "20:30", field_name: "", map_url: "https://[" })).toThrow();
  });
});
