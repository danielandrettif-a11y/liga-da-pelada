import { describe, expect, it } from "vitest";
import { parseEditCallupRequest } from "./edit-callup";

describe("edição da convocação", () => {
  it("normaliza horário, estádio e tipo sem aceitar data fora do formato", () => {
    expect(parseEditCallupRequest({
      callupId: "callup-1", date: "2026-10-17", startTime: "09:30:00", stadiumId: "", roundType: "friendly",
    })).toEqual({
      callupId: "callup-1", date: "2026-10-17", startTime: "09:30", stadiumId: null, roundType: "friendly",
    });
    expect(parseEditCallupRequest({
      callupId: "callup-1", date: "2026-10-17", startTime: null, stadiumId: "stadium-1", roundType: "other",
    })).toMatchObject({ startTime: "08:00", stadiumId: "stadium-1", roundType: "official" });
    expect(parseEditCallupRequest({
      callupId: "callup-1", date: "17/10/2026", startTime: null, stadiumId: null, roundType: null,
    })).toBeNull();
  });
});
