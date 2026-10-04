import { BQ_SCORING_V5, buildBQBasePointBreakdown, calculateBQBasePoints, type BQBaseScoringSnapshot, type BQPlayerStats } from "./bq-scoring";
import { COLUMN_C_SCORING, calculateColumnCRankedPoints, inferOneGoalGames, type ColumnCLineRole } from "./column-c-scoring";

export const RANKED_SCORING = {
  win: BQ_SCORING_V5.win,
  goal: BQ_SCORING_V5.goal,
  assist: BQ_SCORING_V5.assist,
  draw: BQ_SCORING_V5.draw,
  loss: BQ_SCORING_V5.loss,
  ownGoal: BQ_SCORING_V5.ownGoal,
  goalkeeperAppearance: BQ_SCORING_V5.goalkeeperAppearance,
  goalkeeperGoalConceded: BQ_SCORING_V5.goalkeeperGoalConceded,
} as const;

export type RankedScoringStats = {
  wins?: number;
  goals?: number;
  assists?: number;
  draws?: number;
  losses?: number;
  ownGoals?: number;
  goalkeeperAppearances?: number;
  goalkeeperGoalsConceded?: number;
  goalkeeperGoals?: number;
  goalkeeperAssists?: number;
  goalkeeperOwnGoals?: number;
  goalkeeperCleanSheets?: number;
  teamGoalsConceded?: number;
  defensiveCleanGames?: number;
  defensiveOneGoalGames?: number;
  lineRole?: ColumnCLineRole;
};

export type RankedPointBreakdownItem = {
  label: string;
  count: number;
  points: number;
};

function amount(value: number | null | undefined) {
  return Number(value || 0);
}

/**
 * Fonte única da pontuação Ranked. Delega para calculateBQBasePoints para
 * garantir paridade com o Cartola nos 8 scouts básicos.
 */
export function calculateRankedPoints(stats: RankedScoringStats, snapshot?: BQBaseScoringSnapshot) {
  const scoring = snapshot ?? BQ_SCORING_V5;
  if (Number(scoring.version || 0) >= 11) {
    return calculateColumnCRankedPoints(stats.lineRole || "ATA", {
      goals: stats.goals,
      assists: stats.assists,
      ownGoals: stats.ownGoals,
      teamGoalsConceded: stats.teamGoalsConceded,
      defensiveCleanGames: stats.defensiveCleanGames,
      defensiveOneGoalGames: stats.defensiveOneGoalGames,
      goalkeeperGames: stats.goalkeeperAppearances,
      goalkeeperGoals: stats.goalkeeperGoals,
      goalkeeperAssists: stats.goalkeeperAssists,
      goalkeeperOwnGoals: stats.goalkeeperOwnGoals,
      goalkeeperGoalsConceded: stats.goalkeeperGoalsConceded,
      goalkeeperCleanSheets: stats.goalkeeperCleanSheets,
    }, Number(scoring.version || 0));
  }
  const bqStats: BQPlayerStats = {
    goals: amount(stats.goals),
    assists: amount(stats.assists),
    wins: amount(stats.wins),
    draws: amount(stats.draws),
    losses: amount(stats.losses),
    ownGoals: amount(stats.ownGoals),
    goalkeeperAppearances: amount(stats.goalkeeperAppearances),
    goalkeeperGoalsConceded: amount(stats.goalkeeperGoalsConceded),
  };
  return calculateBQBasePoints(scoring, bqStats);
}

export function buildRankedPointBreakdown(
  stats: RankedScoringStats,
  snapshot: BQBaseScoringSnapshot = BQ_SCORING_V5,
  options: { suppressGoalkeeperRewards?: boolean } = {},
): RankedPointBreakdownItem[] {
  if (Number(snapshot.version || 0) >= 11) {
    const role = stats.lineRole || "ATA";
    const rule = COLUMN_C_SCORING[role];
    const lineGoals = Math.max(0, amount(stats.goals) - amount(stats.goalkeeperGoals));
    const lineAssists = Math.max(0, amount(stats.assists) - amount(stats.goalkeeperAssists));
    const lineOwnGoals = Math.max(0, amount(stats.ownGoals) - amount(stats.goalkeeperOwnGoals));
    const lineConceded = Math.max(0, amount(stats.teamGoalsConceded) - amount(stats.goalkeeperGoalsConceded));
    const progressiveDefense = Number(snapshot.version || 0) >= 12;
    const goalkeeperOneGoalGames = progressiveDefense
      ? inferOneGoalGames(
          amount(stats.goalkeeperAppearances),
          amount(stats.goalkeeperCleanSheets),
          amount(stats.goalkeeperGoalsConceded),
        )
      : 0;
    const rows: Array<[string, number, number]> = [
      [`Gols como ${role}`, lineGoals, rule.goal],
      [`Assistências como ${role}`, lineAssists, rule.assist],
      ["Gols sofridos pelo time", lineConceded, rule.conceded],
      ["Clean sheets como DEF", role === "DEF" ? amount(stats.defensiveCleanGames) : 0, COLUMN_C_SCORING.DEF.cleanSheet],
      ["Jogos com 1 gol sofrido como DEF", progressiveDefense && role === "DEF" ? amount(stats.defensiveOneGoalGames) : 0, COLUMN_C_SCORING.DEF.oneGoal],
      ["Gols contra na linha", lineOwnGoals, rule.ownGoal],
      ["Atuações no gol", amount(stats.goalkeeperAppearances), COLUMN_C_SCORING.GOL.appearance],
      ["Gols feitos no gol", amount(stats.goalkeeperGoals), COLUMN_C_SCORING.GOL.goal],
      ["Assistências no gol", amount(stats.goalkeeperAssists), COLUMN_C_SCORING.GOL.assist],
      ["Gols sofridos no gol", amount(stats.goalkeeperGoalsConceded), COLUMN_C_SCORING.GOL.conceded],
      ["Clean sheets no gol", amount(stats.goalkeeperCleanSheets), progressiveDefense ? COLUMN_C_SCORING.GOL.cleanSheet : 2],
      ["Jogos com 1 gol sofrido no gol", goalkeeperOneGoalGames, COLUMN_C_SCORING.GOL.oneGoal],
      ["Gols contra no gol", amount(stats.goalkeeperOwnGoals), COLUMN_C_SCORING.GOL.ownGoal],
    ];
    return rows.filter(([, count]) => count > 0).map(([label, count, unit]) => ({ label, count, points: count * unit }));
  }
  const normalized: BQPlayerStats = {
    goals: amount(stats.goals), assists: amount(stats.assists), wins: amount(stats.wins),
    draws: amount(stats.draws), losses: amount(stats.losses), ownGoals: amount(stats.ownGoals),
    goalkeeperAppearances: amount(stats.goalkeeperAppearances),
    goalkeeperGoalsConceded: amount(stats.goalkeeperGoalsConceded),
  };
  return buildBQBasePointBreakdown(snapshot, normalized, options).map(({ label, count, points }) => ({ label, count, points }));
}

export const RANKED_SCORING_RULES = [
  { key: "attackerGoal", icon: "⚽", label: "Gol ATA/ALA", description: "Gol jogando na linha como ATA/ALA.", points: COLUMN_C_SCORING.ATA.goal },
  { key: "attackerAssist", icon: "🎯", label: "Assist. ATA/ALA", description: "Assistência como ATA/ALA.", points: COLUMN_C_SCORING.ATA.assist },
  { key: "defenderGoal", icon: "⚽", label: "Gol DEF/VOL", description: "Gol jogando na linha como DEF/VOL.", points: COLUMN_C_SCORING.DEF.goal },
  { key: "defenderAssist", icon: "🎯", label: "Assist. DEF/VOL", description: "Assistência como DEF/VOL.", points: COLUMN_C_SCORING.DEF.assist },
  { key: "lineConceded", icon: "🥅", label: "Gol sofrido", description: "Para todo atleta do time em campo.", points: COLUMN_C_SCORING.ATA.conceded, suffix: " por gol" },
  { key: "defenderClean", icon: "🔒", label: "Faixa DEF · 0 sofridos", description: "Por jogo sem sofrer gol como DEF/VOL.", points: COLUMN_C_SCORING.DEF.cleanSheet },
  { key: "defenderOneGoal", icon: "🛡️", label: "Faixa DEF · 1 sofrido", description: "Por jogo com exatamente um gol sofrido como DEF/VOL.", points: COLUMN_C_SCORING.DEF.oneGoal },
  { key: "ownGoal", icon: "⚠️", label: "Gol contra", description: "Por gol contra registrado.", points: COLUMN_C_SCORING.ATA.ownGoal },
] as const;

export const RANKED_GOALKEEPER_SCORING_RULES = [
  { key: "goalkeeperAppearance", icon: "🧤", label: "Atuação no GOL", description: "Somente quando registrado no gol naquela partida.", points: COLUMN_C_SCORING.GOL.appearance },
  { key: "goalkeeperGoal", icon: "⚽", label: "Gol como GOL", description: "Gol marcado durante a atuação no gol.", points: COLUMN_C_SCORING.GOL.goal },
  { key: "goalkeeperAssist", icon: "🎯", label: "Assist. como GOL", description: "Assistência durante a atuação no gol.", points: COLUMN_C_SCORING.GOL.assist },
  { key: "goalkeeperGoalConceded", icon: "🥅", label: "Sofrido no GOL", description: "Por gol sofrido enquanto estiver no gol.", points: COLUMN_C_SCORING.GOL.conceded, suffix: " por gol" },
  { key: "goalkeeperClean", icon: "🔒", label: "Faixa GOL · 0 sofridos", description: "Por atuação no gol sem sofrer gol.", points: COLUMN_C_SCORING.GOL.cleanSheet },
  { key: "goalkeeperOneGoal", icon: "🛡️", label: "Faixa GOL · 1 sofrido", description: "Por atuação no gol com exatamente um gol sofrido.", points: COLUMN_C_SCORING.GOL.oneGoal },
] as const;
