import { describe, expect, it } from "vitest";
import { buildGoogleCalendarUrl, buildIcs } from "./calendar";

const event = {
  title: "Pelada BQ - Rodada 03",
  date: "2026-08-15",
  startTime: "08:00",
  durationMinutes: 120,
  location: "Arena BQ",
  mapUrl: "https://maps.example/arena",
  appUrl: "/rodadas/abc",
};

describe("calendar helpers", () => {
  it("gera link do Google com inicio, fim, fuso e local", () => {
    const url = new URL(buildGoogleCalendarUrl(event, "https://pelada.example"));
    expect(url.hostname).toBe("calendar.google.com");
    expect(url.searchParams.get("dates")).toBe("20260815T080000/20260815T100000");
    expect(url.searchParams.get("ctz")).toBe("America/Sao_Paulo");
    expect(url.searchParams.get("location")).toBe("Arena BQ");
  });

  it("gera arquivo ICS compativel com Apple Agenda", () => {
    const ics = buildIcs(event, "https://pelada.example", new Date("2026-08-13T10:00:00"));
    expect(ics).toContain("DTSTART;TZID=America/Sao_Paulo:20260815T080000");
    expect(ics).toContain("DTEND;TZID=America/Sao_Paulo:20260815T100000");
    expect(ics).toContain("Pelada BQ: https://pelada.example/rodadas/abc");
  });
});
