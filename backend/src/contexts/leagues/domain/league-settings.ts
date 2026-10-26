export type LeagueSettings = {
  matchDuration: number;
  playersPerTeam: number;
  teamsPerRound: number;
  stadiumName: string | null;
  stadiumMapUrl: string | null;
  eventDurationMinutes: number;
};

export class InvalidLeagueSettingsError extends Error {
  constructor(message = "Configurações da pelada inválidas.") {
    super(message);
    this.name = "InvalidLeagueSettingsError";
  }
}

export function parseLeagueName(value: string): string {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 3 || name.length > 80) {
    throw new InvalidLeagueSettingsError("O nome precisa ter entre 3 e 80 caracteres.");
  }
  return name;
}

export function parseLeagueSettings(input: {
  match_duration: number;
  players_per_team: number;
  teams_per_round: number;
  stadium_name: string;
  stadium_map_url: string;
  event_duration_minutes: number;
}): LeagueSettings {
  if (!Number.isInteger(input.match_duration) || input.match_duration < 1 || input.match_duration > 90) {
    throw new InvalidLeagueSettingsError("A duração deve ficar entre 1 e 90 minutos.");
  }
  if (!Number.isInteger(input.players_per_team) || input.players_per_team < 1 || input.players_per_team > 10) {
    throw new InvalidLeagueSettingsError("Cada time deve ter entre 1 e 10 jogadores.");
  }
  if (!Number.isInteger(input.teams_per_round) || input.teams_per_round < 2 || input.teams_per_round > 6) {
    throw new InvalidLeagueSettingsError("A rodada deve ter entre 2 e 6 times.");
  }
  const stadiumName = input.stadium_name.trim();
  const stadiumMapUrl = input.stadium_map_url.trim();
  if (stadiumName.length > 240) {
    throw new InvalidLeagueSettingsError("O nome/endereço do estádio é muito longo.");
  }
  if (stadiumMapUrl && !/^https?:\/\//i.test(stadiumMapUrl)) {
    throw new InvalidLeagueSettingsError("O link do mapa precisa começar com http:// ou https://.");
  }
  if (stadiumMapUrl.length > 1000) {
    throw new InvalidLeagueSettingsError("O link do mapa é muito longo.");
  }
  if (!Number.isInteger(input.event_duration_minutes)
    || input.event_duration_minutes < 30 || input.event_duration_minutes > 720) {
    throw new InvalidLeagueSettingsError("A duração total da pelada deve ficar entre 30 minutos e 12 horas.");
  }
  return {
    matchDuration: input.match_duration,
    playersPerTeam: input.players_per_team,
    teamsPerRound: input.teams_per_round,
    stadiumName: stadiumName || null,
    stadiumMapUrl: stadiumMapUrl || null,
    eventDurationMinutes: input.event_duration_minutes,
  };
}
