export type EventWeather = {
  precipitationProbability: number | null;
  precipitationMm: number;
  label: string;
  forecast?: WeatherForecastDay[];
};

export type WeatherForecastDay = {
  date: string;
  precipitationProbability: number | null;
  precipitationMm: number;
  temperatureMin: number | null;
  temperatureMax: number | null;
  label: string;
};

type HourlyForecast = {
  time?: string[];
  precipitation_probability?: Array<number | null>;
  precipitation?: Array<number | null>;
};

type DailyForecast = {
  time?: string[];
  precipitation_probability_max?: Array<number | null>;
  precipitation_sum?: Array<number | null>;
  temperature_2m_min?: Array<number | null>;
  temperature_2m_max?: Array<number | null>;
};

const weatherCache = new Map<string, { expiresAt: number; data: Promise<unknown | null> }>();

function getCachedForecast(url: string): Promise<unknown | null> {
  const cached = weatherCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const data = fetch(url, { signal: AbortSignal.timeout(5_000) })
    .then(async (response) => response.ok ? response.json() : null)
    .catch(() => null);
  weatherCache.set(url, { expiresAt: Date.now() + 30 * 60_000, data });
  return data;
}

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

export function summarizeWeeklyForecast(daily: DailyForecast): WeatherForecastDay[] {
  return (daily.time || []).slice(0, 7).map((date, index) => {
    const precipitationProbability = daily.precipitation_probability_max?.[index] ?? null;
    const precipitationMm = Math.round((daily.precipitation_sum?.[index] || 0) * 10) / 10;
    return {
      date,
      precipitationProbability,
      precipitationMm,
      temperatureMin: daily.temperature_2m_min?.[index] ?? null,
      temperatureMax: daily.temperature_2m_max?.[index] ?? null,
      label: label(precipitationProbability, precipitationMm),
    };
  });
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
  const hourlyQuery = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    hourly: "precipitation_probability,precipitation",
    timezone: "America/Sao_Paulo",
    start_date: date,
    end_date: date,
  });
  const dailyQuery = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum",
    timezone: "America/Sao_Paulo",
    forecast_days: "7",
  });
  try {
    const [hourlyData, dailyData] = await Promise.all([
      getCachedForecast(`https://api.open-meteo.com/v1/forecast?${hourlyQuery}`) as Promise<{ hourly?: HourlyForecast } | null>,
      getCachedForecast(`https://api.open-meteo.com/v1/forecast?${dailyQuery}`) as Promise<{ daily?: DailyForecast } | null>,
    ]);
    const weather = hourlyData?.hourly
      ? summarizeEventWeather(hourlyData.hourly, date, startTime, input.durationMinutes || 120)
      : null;
    if (!weather) return null;
    return { ...weather, forecast: dailyData?.daily ? summarizeWeeklyForecast(dailyData.daily) : [] };
  } catch {
    return null;
  }
}
