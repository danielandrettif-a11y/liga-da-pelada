import { describe, expect, it } from "vitest";
import {
  buildRoundMatchAvailability,
  getRoundMatchStateVersion,
  resolveRoundPlayerMatchStatus,
} from "./round-match-availability";

describe("round match availability", () => {
  it("matches the server attendance rule outside manual formation", () => {
    expect(resolveRoundPlayerMatchStatus({
      player_id: "p1",
      availability_status: "available",
      attendance_status: "pending",
    }, "balanced")).toBe("absent");
    expect(resolveRoundPlayerMatchStatus({
      player_id: "p1",
      availability_status: "available",
      attendance_status: "present",
    }, "balanced")).toBe("available");
  });

  it("keeps manual rounds independent from attendance and always honors injuries", () => {
    expect(resolveRoundPlayerMatchStatus({
      player_id: "p1",
      availability_status: "available",
      attendance_status: "pending",
    }, "manual")).toBe("available");
    expect(resolveRoundPlayerMatchStatus({
      player_id: "p2",
      availability_status: "injured",
      attendance_status: "present",
    }, "manual")).toBe("injured");
  });

  it("changes the setup version when an admin marks and releases a player", () => {
    const present = [{ player_id: "p1", availability_status: "available", attendance_status: "present" }];
    const absent = [{ player_id: "p1", availability_status: "injured", attendance_status: "present" }];
    expect(getRoundMatchStateVersion(present)).not.toBe(getRoundMatchStateVersion(absent));
    expect(buildRoundMatchAvailability(present, "balanced").get("p1")).toBe("available");
    expect(buildRoundMatchAvailability(absent, "balanced").get("p1")).toBe("injured");
  });
});
