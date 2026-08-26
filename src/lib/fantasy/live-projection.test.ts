import { describe, expect, it } from "vitest";
import { DEFAULT_FANTASY_SETTINGS } from "./config";
import { projectFantasyLiveLineups, projectFantasyLiveStats } from "./live-projection";

describe("live fantasy projection", () => {
  const baseMatch = {
    id: "match-1",
    teamAId: "a",
    teamBId: "b",
    scoreA: 1,
    scoreB: 0,
    players: [
      { playerId: "scorer", teamId: "a", resultEligible: true },
      { playerId: "keeper", teamId: "a", resultEligible: true },
      { playerId: "loser", teamId: "b", resultEligible: true },
    ],
    goalkeepers: [{ playerId: "keeper", teamId: "a" }],
    events: [{ playerId: "scorer", assistPlayerId: "keeper", teamId: "a" }],
  } as const;

  it("mostra gol e assistência imediatamente, sem resultado antes do fim", () => {
    const projected = projectFantasyLiveStats([{ ...baseMatch, status: "live" }], DEFAULT_FANTASY_SETTINGS);
    expect(projected.get("scorer")?.goals).toBe(1);
    expect(projected.get("scorer")?.wins).toBe(0);
    expect(projected.get("keeper")?.assists).toBe(1);
    expect(projected.get("keeper")?.goalkeeperGames).toBe(1);
  });

  it("inclui resultado somente depois de encerrar", () => {
    const projected = projectFantasyLiveStats([{ ...baseMatch, status: "finished" }], DEFAULT_FANTASY_SETTINGS);
    expect(projected.get("scorer")?.wins).toBe(1);
    expect(projected.get("loser")?.losses).toBe(1);
  });

  it("atualiza a projeção quando o evento deixa de existir", () => {
    const withGoal = projectFantasyLiveStats([{ ...baseMatch, status: "live" }], DEFAULT_FANTASY_SETTINGS);
    const withoutGoal = projectFantasyLiveStats([{ ...baseMatch, status: "live", scoreA: 0, events: [] }], DEFAULT_FANTASY_SETTINGS);
    expect(withGoal.get("scorer")!.basePoints).toBeGreaterThan(withoutGoal.get("scorer")?.basePoints || 0);
  });

  it("separa gol contra de gol marcado e aplica a penalidade", () => {
    const stats = projectFantasyLiveStats([
      {
        ...baseMatch,
        status: "live",
        scoreA: 0,
        events: [{ playerId: "scorer", teamId: "a", isOwnGoal: true }],
      },
    ], DEFAULT_FANTASY_SETTINGS);

    expect(stats.get("scorer")).toMatchObject({ goals: 0, ownGoals: 1, basePoints: -3 });
  });

  it("aplica capitão e palpites como prévia", () => {
    const stats = projectFantasyLiveStats([{ ...baseMatch, status: "live" }], DEFAULT_FANTASY_SETTINGS);
    const [lineup] = projectFantasyLiveLineups([
      { id: "lineup", userId: "user", playerIds: ["scorer", "keeper"], captainPlayerId: "scorer", topScorerPlayerId: "scorer", topAssistPlayerId: "keeper" },
    ], stats, DEFAULT_FANTASY_SETTINGS);
    expect(lineup.captainBonus).toBe(
      stats.get("scorer")!.basePoints * (DEFAULT_FANTASY_SETTINGS.captainMultiplier - 1)
    );
    expect(lineup.predictionPoints).toBe(DEFAULT_FANTASY_SETTINGS.topScorerPredictionPoints + DEFAULT_FANTASY_SETTINGS.topAssistPredictionPoints);
  });

  it("ignora convidados ao definir os líderes dos palpites", () => {
    const stats = projectFantasyLiveStats([{
      ...baseMatch,
      status: "live",
      scoreA: 3,
      players: [...baseMatch.players, { playerId: "guest", teamId: "a", resultEligible: true }],
      events: [
        { playerId: "guest", teamId: "a" },
        { playerId: "guest", teamId: "a" },
        { playerId: "scorer", teamId: "a" },
      ],
    }], DEFAULT_FANTASY_SETTINGS);
    const eligible = new Set(["scorer", "keeper", "loser"]);
    const [officialPick, guestPick] = projectFantasyLiveLineups([
      { id: "official", userId: "official", playerIds: ["scorer"], topScorerPlayerId: "scorer" },
      { id: "guest", userId: "guest", playerIds: ["scorer"], topScorerPlayerId: "guest" },
    ], stats, DEFAULT_FANTASY_SETTINGS, eligible);

    expect(officialPick.predictionPoints).toBe(DEFAULT_FANTASY_SETTINGS.topScorerPredictionPoints);
    expect(guestPick.predictionPoints).toBe(0);
  });

  it("concede o Artilheiro somente ao ATA correto com dois ou mais gols", () => {
    const stats = projectFantasyLiveStats([
      {
        ...baseMatch,
        status: "live",
        scoreA: 2,
        events: [
          { playerId: "scorer", teamId: "a" },
          { playerId: "scorer", teamId: "a" },
        ],
        players: baseMatch.players.map((player) =>
          player.playerId === "scorer" ? { ...player, playerProfile: "offensive" as const } : player,
        ),
      },
    ], DEFAULT_FANTASY_SETTINGS);

    const [correct, misplaced] = projectFantasyLiveLineups([
      {
        id: "correct",
        userId: "correct",
        playerIds: ["scorer"],
        slots: [{ playerId: "scorer", slotRole: "ATA", playerProfile: "offensive" }],
      },
      {
        id: "misplaced",
        userId: "misplaced",
        playerIds: ["scorer"],
        slots: [{ playerId: "scorer", slotRole: "MEI", playerProfile: "offensive" }],
      },
    ], stats, DEFAULT_FANTASY_SETTINGS);

    expect(correct.positionBonus).toBe(3);
    expect(correct.playerPoints).toBe(13);
    expect(misplaced.positionBonus).toBe(0);
    expect(misplaced.playerPoints).toBe(10);
  });

  it("aplica o pacote de GOL a qualquer atleta nessa vaga e dá +4 de clean sheet", () => {
    const stats = projectFantasyLiveStats([{ ...baseMatch, status: "finished" }], DEFAULT_FANTASY_SETTINGS);
    const [goalkeeperSlot, fieldSlot] = projectFantasyLiveLineups([
      { id: "gol", userId: "gol", playerIds: ["keeper"], slots: [{ playerId: "keeper", slotRole: "GOL" }] },
      { id: "mei", userId: "mei", playerIds: ["keeper"], slots: [{ playerId: "keeper", slotRole: "MEI", playerProfile: "midfield" }] },
    ], stats, DEFAULT_FANTASY_SETTINGS);

    expect(goalkeeperSlot.positionBonus).toBe(4);
    // Fora da vaga GOL, ele recebe apenas o eventual pacote da posição MEI.
    expect(fieldSlot.positionBonus).toBe(1);
    expect(goalkeeperSlot.playerPoints).toBe(fieldSlot.playerPoints + 3);
  });
});
