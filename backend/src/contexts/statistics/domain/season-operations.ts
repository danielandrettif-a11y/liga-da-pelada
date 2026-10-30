export type OverallTrend = "rising" | "steady" | "falling";

export type PlayerCardOverall = {
  overall: number;
  trend: OverallTrend;
  positions: { DEF: number; ALA_MEI: number; ATA: number; GOL: number } | null;
  positionTrends: Record<"DEF" | "ALA_MEI" | "ATA" | "GOL", OverallTrend>;
  goalkeeperGames: number;
  goalkeeperRounds: number;
  roundsPlayed: number;
};

export type PlayerCardOverallMap = Record<string, PlayerCardOverall>;

const trend = (value: unknown): OverallTrend => value === "rising" || value === "falling" ? value : "steady";

export function buildPlayerCardOverallMap(
  rows: Array<Record<string, unknown>>,
  activePlayerIds: Set<string>,
): PlayerCardOverallMap {
  return Object.fromEntries(rows.flatMap((row) => {
    const playerId = String(row.player_id || "");
    const overall = Number(row.overall);
    if (!activePlayerIds.has(playerId) || !Number.isFinite(overall)) return [];
    const values = {
      DEF: Number(row.def_overall),
      ALA_MEI: Number(row.ala_mei_overall),
      ATA: Number(row.ata_overall),
      GOL: Number(row.gol_overall),
    };
    return [[playerId, {
      overall,
      trend: trend(row.trend),
      positions: Object.values(values).every(Number.isFinite) ? values : null,
      positionTrends: {
        DEF: trend(row.def_trend),
        ALA_MEI: trend(row.ala_mei_trend),
        ATA: trend(row.ata_trend),
        GOL: trend(row.gol_trend),
      },
      goalkeeperGames: Number(row.goalkeeper_games || 0),
      goalkeeperRounds: Number(row.goalkeeper_rounds || 0),
      roundsPlayed: Number(row.rounds_played || 0),
    } satisfies PlayerCardOverall]];
  }));
}

export type SeasonTeamStandingPlayer = { id: string; name: string; total: number };
export type SeasonTeamStanding = {
  key: string; name: string; color: string; crestUrl: string;
  games: number; wins: number; draws: number; losses: number;
  goalsFor: number; goalsAgainst: number; goalDifference: number; points: number;
  topScorer: SeasonTeamStandingPlayer | null;
  topAssister: SeasonTeamStandingPlayer | null;
};

export type StandingRound = {
  teams: Array<{ id: string; name: string; crest_url: string | null }>;
  matches: Array<{
    status: string; team_a_id: string; team_b_id: string; score_a: number; score_b: number;
    events: Array<{
      team_id: string; is_own_goal: boolean; player_id: string | null; player_name: string | null;
      assist_player_id: string | null; assist_player_name: string | null;
    }>;
  }>;
};

const CLUBS = [
  { name: "Meia Boca Juniors", color: "#FACC15", crestUrl: "/team-crests/meia-boca-juniors.webp" },
  { name: "Patético de Madrid", color: "#F43F5E", crestUrl: "/team-crests/patetico-de-madrid.webp" },
  { name: "MilamB", color: "#DC2626", crestUrl: "/team-crests/milamb.webp" },
  { name: "Inter de Meião", color: "#2563EB", crestUrl: "/team-crests/inter-de-meiao.webp" },
] as const;

const normalizedName = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .trim().toLocaleLowerCase("pt-BR");

function clubKey(team: StandingRound["teams"][number]) {
  return CLUBS.find((club) => club.crestUrl === team.crest_url)?.crestUrl
    || CLUBS.find((club) => normalizedName(club.name) === normalizedName(team.name))?.crestUrl
    || null;
}

function increment(
  leaders: Map<string, Map<string, SeasonTeamStandingPlayer>>,
  key: string,
  playerId: string | null,
  playerName: string | null,
) {
  if (!playerId) return;
  const club = leaders.get(key) || new Map<string, SeasonTeamStandingPlayer>();
  const current = club.get(playerId) || { id: playerId, name: playerName || "Jogador", total: 0 };
  club.set(playerId, { ...current, total: current.total + 1 });
  leaders.set(key, club);
}

const leader = (values: Map<string, SeasonTeamStandingPlayer> | undefined) =>
  values ? [...values.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "pt-BR"))[0] || null : null;

export function buildSeasonTeamStandings(rounds: StandingRound[]): SeasonTeamStanding[] {
  const table = new Map<string, SeasonTeamStanding>(CLUBS.map((club) => [club.crestUrl, {
    key: club.crestUrl, name: club.name, color: club.color, crestUrl: club.crestUrl,
    games: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0,
    goalDifference: 0, points: 0, topScorer: null, topAssister: null,
  }]));
  const scorers = new Map<string, Map<string, SeasonTeamStandingPlayer>>();
  const assisters = new Map<string, Map<string, SeasonTeamStandingPlayer>>();
  for (const round of rounds) {
    const byTeam = new Map(round.teams.flatMap((team) => {
      const key = clubKey(team);
      return key ? [[team.id, key] as const] : [];
    }));
    for (const match of round.matches) {
      if (match.status !== "finished") continue;
      const aKey = byTeam.get(match.team_a_id);
      const bKey = byTeam.get(match.team_b_id);
      if (!aKey || !bKey || aKey === bKey) continue;
      const a = table.get(aKey)!;
      const b = table.get(bKey)!;
      const scoreA = Number(match.score_a || 0);
      const scoreB = Number(match.score_b || 0);
      a.games += 1; b.games += 1;
      a.goalsFor += scoreA; a.goalsAgainst += scoreB;
      b.goalsFor += scoreB; b.goalsAgainst += scoreA;
      if (scoreA > scoreB) { a.wins += 1; a.points += 3; b.losses += 1; }
      else if (scoreB > scoreA) { b.wins += 1; b.points += 3; a.losses += 1; }
      else { a.draws += 1; b.draws += 1; a.points += 1; b.points += 1; }
      for (const event of match.events) {
        const key = byTeam.get(event.team_id);
        if (!key || event.is_own_goal) continue;
        increment(scorers, key, event.player_id, event.player_name);
        increment(assisters, key, event.assist_player_id, event.assist_player_name);
      }
    }
  }
  for (const standing of table.values()) {
    standing.goalDifference = standing.goalsFor - standing.goalsAgainst;
    standing.topScorer = leader(scorers.get(standing.key));
    standing.topAssister = leader(assisters.get(standing.key));
  }
  return [...table.values()].sort((a, b) => b.points - a.points || b.wins - a.wins
    || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || a.name.localeCompare(b.name, "pt-BR"));
}

export type ReprocessPreviewResult = {
  can_reprocess: boolean; reason?: string; season_id?: string; rounds_count?: number; lineups_count?: number;
  rounds?: Array<{ round_id: string; number: number; date: string; market_status: string; lineups_count: number }>;
  accounts?: Array<{ user_id: string; current_budget: number; total_points: number; rounds_played: number }>;
};

export type ReprocessExecutionResult = {
  success: boolean; error?: string; season_id?: string; rounds_reprocessed?: number; lineups_reprocessed?: number;
};
