export type SpeedRating = 1 | 2 | 3;

export type SpeedTeamSummary = {
  stars: { 1: number; 2: number; 3: number };
  average: number;
};

export type SpeedDrawCommand = {
  playerIds: string[];
  attendanceOrder?: string[];
  teamCount: number;
  playersPerTeam: number;
};

export type SpeedDrawResult = {
  teams: string[][];
  teamSummaries: SpeedTeamSummary[];
  unratedCount: number;
  attendanceOrder: string[];
};
