import type { PlayerProfile, TeamFormationMode } from "./types";

export type AttendanceDrawPlayer = {
  id: string;
  points?: number;
  player_profile?: PlayerProfile | null;
  is_goalkeeper?: boolean;
};

export type AttendanceDrawResult = {
  teams: string[][];
  starters: string[];
  waiting: string[];
};

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const value = random();
    const safe = Number.isFinite(value) ? Math.min(Math.max(value, 0), 0.9999999999999999) : 0;
    const target = Math.floor(safe * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function distributeBalanced(players: AttendanceDrawPlayer[], teamCount: number, random: () => number): string[][] {
  const teams = Array.from({ length: teamCount }, () => ({ players: [] as AttendanceDrawPlayer[], points: 0 }));
  const ordered = players
    .map((player) => ({ player, tieBreaker: random() }))
    .sort((a, b) => (b.player.points || 0) - (a.player.points || 0) || a.tieBreaker - b.tieBreaker)
    .map(({ player }) => player);

  for (const player of ordered) {
    const profile = player.player_profile || "midfield";
    const minimumSize = Math.min(...teams.map((team) => team.players.length));
    const candidates = teams
      .map((team, index) => ({ team, index }))
      .filter(({ team }) => team.players.length === minimumSize)
      .sort((a, b) => {
        if (player.is_goalkeeper) {
          const goalkeeperDifference = a.team.players.filter((item) => item.is_goalkeeper).length
            - b.team.players.filter((item) => item.is_goalkeeper).length;
          if (goalkeeperDifference !== 0) return goalkeeperDifference;
        }
        const profileDifference = a.team.players.filter((item) => (item.player_profile || "midfield") === profile).length
          - b.team.players.filter((item) => (item.player_profile || "midfield") === profile).length;
        if (profileDifference !== 0) return profileDifference;
        if (a.team.points !== b.team.points) return a.team.points - b.team.points;
        return a.index - b.index;
      });
    candidates[0].team.players.push(player);
    candidates[0].team.points += player.points || 0;
  }

  return teams.map((team) => team.players.map((player) => player.id));
}

export function drawTeamsByAttendance({
  players,
  attendanceOrder,
  teamCount,
  playersPerTeam,
  mode,
  random = Math.random,
}: {
  players: AttendanceDrawPlayer[];
  attendanceOrder: string[];
  teamCount: number;
  playersPerTeam: number;
  mode: Exclude<TeamFormationMode, "manual">;
  random?: () => number;
}): AttendanceDrawResult {
  const capacity = teamCount * playersPerTeam;
  const minimumPresent = playersPerTeam * 2;
  const playerById = new Map(players.map((player) => [player.id, player]));
  const uniqueAttendance = [...new Set(attendanceOrder)].filter((id) => playerById.has(id));

  if (teamCount < 2 || playersPerTeam < 1) throw new Error("Configuracao de times invalida.");
  if (players.length < minimumPresent) throw new Error(`Selecione pelo menos ${minimumPresent} jogadores.`);
  if (players.length > capacity) throw new Error(`A rodada aceita no maximo ${capacity} jogadores.`);
  if (uniqueAttendance.length < minimumPresent) throw new Error(`Marque pelo menos ${minimumPresent} presencas.`);

  const starterIds = uniqueAttendance.slice(0, minimumPresent);
  const starterPlayers = starterIds.map((id) => playerById.get(id)!);
  const starterTeams = mode === "random"
    ? (() => {
      const result = Array.from({ length: 2 }, () => [] as string[]);
      shuffle(starterPlayers, random).forEach((player, index) => result[index % 2].push(player.id));
      return result;
    })()
    : distributeBalanced(starterPlayers, 2, random);

  const starterSet = new Set(starterIds);
  const orderedWaitingIds = [
    ...uniqueAttendance.slice(minimumPresent),
    ...players.map((player) => player.id).filter((id) => !starterSet.has(id) && !uniqueAttendance.includes(id)),
  ];
  const waitingTeams = Array.from({ length: Math.max(0, teamCount - 2) }, (_, index) =>
    orderedWaitingIds.slice(index * playersPerTeam, (index + 1) * playersPerTeam),
  );

  return {
    teams: [...starterTeams, ...waitingTeams],
    starters: starterIds,
    waiting: orderedWaitingIds,
  };
}
