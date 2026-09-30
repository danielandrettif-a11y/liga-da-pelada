import { unstable_cache } from "next/cache";

export type EventWeather = {
  precipitationProbability: number | null;
  precipitationMm: number;
  label: string;
};

type OpenMeteoHourly = {
  time?: string[];
  precipitation_probability?: Array<number | null>;
  precipitation?: Array<number | null>;
};

export function summarizeEventWeather(
  hourly: OpenMeteoHourly,
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
  if (!indexes.length) return null;

  const probabilities = indexes
    .map((index) => hourly.precipitation_probability?.[index])
    .filter((value): value is number => Number.isFinite(value));
  const precipitationMm = Math.round(indexes.reduce(
    (total, index) => total + (hourly.precipitation?.[index] || 0),
    0,
  ) * 10) / 10;
  const precipitationProbability = probabilities.length ? Math.max(...probabilities) : null;
  const label = precipitationMm >= 5 || (precipitationProbability ?? 0) >= 70
    ? "Chuva provável"
    : precipitationMm > 0 || (precipitationProbability ?? 0) >= 30
      ? "Pode chover"
      : "Sem chuva prevista";

  return { precipitationProbability, precipitationMm, label };
}

const getCachedEventWeather = unstable_cache(async (
  latitude: number,
  longitude: number,
  date: string,
  startTime: string,
  durationMinutes: number,
) => {
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
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    const data = await response.json() as { hourly?: OpenMeteoHourly };
    return data.hourly ? summarizeEventWeather(data.hourly, date, startTime, durationMinutes) : null;
  } catch {
    return null;
  }
}, ["open-meteo-event-weather"], { revalidate: 1800 });

export async function getEventWeather(input: {
  latitude?: number | null;
  longitude?: number | null;
  date?: string | null;
  startTime?: string | null;
  durationMinutes?: number | null;
}) {
  const { latitude, longitude, date, startTime } = input;
  if (
    latitude == null || longitude == null || !date || !startTime
    || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
  ) return null;

  return getCachedEventWeather(latitude, longitude, date, startTime, input.durationMinutes || 120);
}

