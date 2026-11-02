export type EventWeather = {
  precipitationProbability: number | null;
  precipitationMm: number;
  label: string;
};

type HourlyForecast = {
  time?: string[];
  precipitation_probability?: Array<number | null>;
  precipitation?: Array<number | null>;
};

function label(probability: number | null, precipitationMm: number) {
  if (precipitationMm >= 5 || (probability ?? 0) >= 70) return "Chuva provável";
  if (precipitationMm > 0 || (probability ?? 0) >= 30) return "Pode chover";
  return "Sem chuva prevista";
}

export function summarizeEventWeather(
  hourly: HourlyForecast,
  date: string,
  startTime: string,
  durationMinutes: number,
): EventWeather | null {
  const start = Date.parse(`${date}T${startTime.slice(0, 5)}:00Z`);
  if (!Number.isFinite(start) || durationMinutes <= 0) return null;
  const end = start + durationMinutes * 60_000;
  const indexes = (hourly.time || []).flatMap((time, index) => {
    const hourEnd = Date.parse(`${time}:00Z`);
    return Number.isFinite(hourEnd) && hourEnd > start && hourEnd - 3_600_000 < end ? [index] : [];
  });
  if (indexes.length === 0) return null;
  const probabilities = indexes
    .map((index) => hourly.precipitation_probability?.[index])
    .filter((value): value is number => Number.isFinite(value));
  const precipitationMm = Math.round(indexes.reduce(
    (total, index) => total + (hourly.precipitation?.[index] || 0),
    0,
  ) * 10) / 10;
  const precipitationProbability = probabilities.length > 0 ? Math.max(...probabilities) : null;
  return { precipitationProbability, precipitationMm, label: label(precipitationProbability, precipitationMm) };
}

export async function getEventWeather(input: {
  latitude?: number | null;
  longitude?: number | null;
  date?: string | null;
  startTime?: string | null;
  durationMinutes?: number | null;
}): Promise<EventWeather | null> {
  const { latitude, longitude, date, startTime } = input;
  if (latitude == null || longitude == null || !date || !startTime
    || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  const query = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    hourly: "precipitation_probability,precipitation",
    timezone: "America/Sao_Paulo",
    start_date: date,
    end_date: date,
  });
  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    const data = await response.json() as { hourly?: HourlyForecast };
    return data.hourly
      ? summarizeEventWeather(data.hourly, date, startTime, input.durationMinutes || 120)
      : null;
  } catch {
    return null;
  }
}
