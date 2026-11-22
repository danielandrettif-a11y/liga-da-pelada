export class InvalidQuickMatchError extends Error {
  constructor(message = "Dados da partida rápida inválidos.") {
    super(message);
    this.name = "InvalidQuickMatchError";
  }
}

export type QuickMatchInput = {
  date: string;
  startTime: string;
  fieldName: string;
  mapUrl: string;
  playersPerTeam: number;
  teamsPerRound: number;
};

export type QuickMatchSession = {
  league_id: string;
  callup_id: string;
  round_id: string;
};

export function parseQuickMatch(input: {
  date: string;
  start_time: string;
  field_name: string;
  map_url: string;
}): QuickMatchInput {
  const fieldName = input.field_name.trim().replace(/\s+/g, " ");
  let mapUrl = input.map_url.trim();
  if (mapUrl && !/^https?:\/\//i.test(mapUrl)) mapUrl = `https://${mapUrl}`;

  let validUrl = true;
  if (mapUrl) {
    try {
      const parsed = new URL(mapUrl);
      validUrl = parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      validUrl = false;
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)
    || !/^\d{2}:\d{2}$/.test(input.start_time)
    || (fieldName.length > 0 && (fieldName.length < 2 || fieldName.length > 80))
    || mapUrl.length > 1000
    || !validUrl) {
    throw new InvalidQuickMatchError();
  }

  return {
    date: input.date,
    startTime: input.start_time,
    fieldName,
    mapUrl,
    playersPerTeam: 5,
    teamsPerRound: 3,
  };
}
