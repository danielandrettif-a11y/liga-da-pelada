import { TEAM_PRESETS } from "./teamPresets";

export type SeasonTeamStandingPlayer = {
  id: string;
  name: string;
  total: number;
};

export type SeasonTeamStanding = {
  key: string;
  name: string;
  color: string;
  crestUrl: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  topScorer: SeasonTeamStandingPlayer | null;
  topAssister: SeasonTeamStandingPlayer | null;
};

type StandingTeam = {
  id: string;
  name: string;
  crest_url?: string | null;
};

type StandingEvent = {
  team_id: string;
  is_own_goal?: boolean | null;
  player_id?: string | null;
  assist_player_id?: string | null;
  player?: { id: string; name: string } | null;
  assist_player?: { id: string; name: string } | null;
};

type StandingMatch = {
  status: string;
  team_a_id: string;
  team_b_id: string;
  score_a?: number | null;
  score_b?: number | null;
  match_events?: StandingEvent[] | null;
};

export type SeasonTeamStandingRound = {
  teams?: StandingTeam[] | null;
  matches?: StandingMatch[] | null;
};

const OFFICIAL_CLUBS = TEAM_PRESETS.flatMap((team) => team.crestUrl ? [{ ...team, crestUrl: team.crestUrl }] : []).slice(0, 4);

function normalizeTeamName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");
}

function clubKeyForTeam(team: StandingTeam) {
  const byCrest = OFFICIAL_CLUBS.find((club) => club.crestUrl === team.crest_url);
  if (byCrest) return byCrest.crestUrl;
  const normalizedName = normalizeTeamName(team.name);
  return OFFICIAL_CLUBS.find((club) => normalizeTeamName(club.name) === normalizedName)?.crestUrl || null;
}

function incrementLeader(
  leaders: Map<string, Map<string, SeasonTeamStandingPlayer>>,
  clubKey: string,
  player: { id: string; name: string } | null | undefined,
) {
  if (!player?.id) return;
  const clubLeaders = leaders.get(clubKey) || new Map<string, SeasonTeamStandingPlayer>();
  const current = clubLeaders.get(player.id) || { id: player.id, name: player.name, total: 0 };
  clubLeaders.set(player.id, { ...current, total: current.total + 1 });
  leaders.set(clubKey, clubLeaders);
}

function getLeader(leaders: Map<string, SeasonTeamStandingPlayer> | undefined) {
  if (!leaders?.size) return null;
  return [...leaders.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "pt-BR"))[0] || null;
}

export function buildSeasonTeamStandings(rounds: SeasonTeamStandingRound[]): SeasonTeamStanding[] {
  const table = new Map<string, SeasonTeamStanding>(OFFICIAL_CLUBS.map((club) => [
    club.crestUrl,
    {
      key: club.crestUrl,
      name: club.name,
      color: club.color,
      crestUrl: club.crestUrl,
      games: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
      topScorer: null,
      topAssister: null,
    },
  ]));
  const scorers = new Map<string, Map<string, SeasonTeamStandingPlayer>>();
  const assisters = new Map<string, Map<string, SeasonTeamStandingPlayer>>();

  for (const round of rounds) {
    const clubByTeamId = new Map<string, string>();
    for (const team of round.teams || []) {
      const clubKey = clubKeyForTeam(team);
      if (clubKey) clubByTeamId.set(team.id, clubKey);
    }

    for (const match of round.matches || []) {
      if (match.status !== "finished") continue;
      const clubAKey = clubByTeamId.get(match.team_a_id);
      const clubBKey = clubByTeamId.get(match.team_b_id);
      if (!clubAKey || !clubBKey || clubAKey === clubBKey) continue;
      const clubA = table.get(clubAKey)!;
      const clubB = table.get(clubBKey)!;
      const scoreA = Number(match.score_a || 0);
      const scoreB = Number(match.score_b || 0);

      clubA.games += 1;
      clubB.games += 1;
      clubA.goalsFor += scoreA;
      clubA.goalsAgainst += scoreB;
      clubB.goalsFor += scoreB;
      clubB.goalsAgainst += scoreA;

      if (scoreA > scoreB) {
        clubA.wins += 1;
        clubA.points += 3;
        clubB.losses += 1;
      } else if (scoreB > scoreA) {
        clubB.wins += 1;
        clubB.points += 3;
        clubA.losses += 1;
      } else {
        clubA.draws += 1;
        clubB.draws += 1;
        clubA.points += 1;
        clubB.points += 1;
      }

      for (const event of match.match_events || []) {
        const eventClubKey = clubByTeamId.get(event.team_id);
        if (!eventClubKey) continue;
        if (!event.is_own_goal) {
          incrementLeader(scorers, eventClubKey, event.player);
          incrementLeader(assisters, eventClubKey, event.assist_player);
        }
      }
    }
  }

  for (const standing of table.values()) {
    standing.goalDifference = standing.goalsFor - standing.goalsAgainst;
    standing.topScorer = getLeader(scorers.get(standing.key));
    standing.topAssister = getLeader(assisters.get(standing.key));
  }

  return [...table.values()].sort((a, b) =>
    b.points - a.points
    || b.wins - a.wins
    || b.goalDifference - a.goalDifference
    || b.goalsFor - a.goalsFor
    || a.name.localeCompare(b.name, "pt-BR")
  );
}
