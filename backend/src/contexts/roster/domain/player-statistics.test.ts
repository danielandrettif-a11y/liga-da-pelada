import { describe, expect, it } from "vitest";
import type { RosterPlayer } from "./player-catalog.js";
import {
  buildRosterPlayerStatistics,
  groupRosterPlayers,
  parseRosterRoundType,
} from "./player-statistics.js";

function player(id: string, memberCategory: RosterPlayer["member_category"]): RosterPlayer {
  return {
    id, name: id, nickname: null, profile_bio: null, avatar_url: "avatar.jpg",
    avatar_alternate_url: null, player_profile: "offensive", initial_player_profile: "offensive",
    profile_decision_source: "initial", profile_source_round_id: null, overall_traits: ["offensive"],
    overall_seed_mode: "observed", is_goalkeeper: false, member_category: memberCategory,
    is_selectable: true, is_competitive_profile_complete: memberCategory === "player",
    show_fitness_stats: false, registration_source: "admin", profile_scope: "persistent",
    created_by_user_id: null, created_at: "2026-10-20T10:00:00.000Z",
  };
}

describe("player statistics domain", () => {
  it("uses ranking points for official rounds and keeps legacy points", () => {
    const result = buildRosterPlayerStatistics(
      [player("first", "player"), player("second", "guest")],
      [
        { playerId: "first", rounds: "2", games: 4, goals: 3, assists: 1, wins: 1, draws: 1, losses: 0, points: 4, rankingPoints: "9.5" },
        { playerId: "second", rounds: 1, games: 2, goals: 0, assists: 0, wins: 1, draws: 0, losses: 0, points: 6, rankingPoints: null },
      ],
      "official",
    );
    expect(result.map(({ id, points, legacyPoints }) => ({ id, points, legacyPoints }))).toEqual([
      { id: "first", points: 9.5, legacyPoints: 4 },
      { id: "second", points: 6, legacyPoints: 6 },
    ]);
  });

  it("uses legacy points for friendly rounds and normalizes missing totals", () => {
    const result = buildRosterPlayerStatistics(
      [player("without-stats", "player"), player("with-stats", "guest")],
      [{ playerId: "with-stats", rounds: 1, games: 2, goals: 0, assists: 0, wins: 0, draws: 1, losses: 0, points: 3, rankingPoints: 99 }],
      "friendly",
    );
    expect(result[0]).toMatchObject({ id: "with-stats", points: 3 });
    expect(result[1]).toMatchObject({ id: "without-stats", rounds: 0, points: 0, legacyPoints: 0 });
  });

  it("groups every category and enriches only official players with valid OVR", () => {
    const statistics = buildRosterPlayerStatistics([
      player("member", "player"), player("guest", "guest"),
      player("wag", "wag"), player("supporter", "supporter"),
    ], [], "official");
    const groups = groupRosterPlayers(statistics, [{
      playerId: "member", overall: "81.5", defOverall: 80, alaMeiOverall: 82,
      ataOverall: 83, golOverall: 70,
    }, {
      playerId: "guest", overall: 99, defOverall: 99, alaMeiOverall: 99,
      ataOverall: 99, golOverall: 99,
    }]);
    expect(groups.officialPlayers[0]).toMatchObject({
      id: "member", overall: 81.5, overallPositions: { DEF: 80, ALA_MEI: 82, ATA: 83, GOL: 70 },
    });
    expect(groups.activeGuests[0]).not.toHaveProperty("overall");
    expect(groups.wags).toHaveLength(1);
    expect(groups.supporters).toHaveLength(1);
  });

  it("rejects unknown round types", () => {
    expect(() => parseRosterRoundType("training")).toThrow("Tipo de rodada inválido");
  });
});
