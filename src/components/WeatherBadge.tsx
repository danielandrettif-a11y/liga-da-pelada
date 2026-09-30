import type { EventWeather } from "@/lib/weather";

export function WeatherBadge({ weather }: { weather?: EventWeather | null }) {
  if (!weather) return null;

  return (
    <div className="pointer-events-auto relative z-30 inline-flex items-center gap-1.5 rounded-xl border border-sky-300/25 bg-sky-400/10 px-2.5 py-1 text-[10px] font-bold text-sky-100 backdrop-blur-md">
      <span aria-hidden="true">🌧️</span>
      <span>{weather.label}</span>
      {weather.precipitationProbability !== null && <span>· {weather.precipitationProbability}%</span>}
      {weather.precipitationMm > 0 && <span>· {weather.precipitationMm.toLocaleString("pt-BR")} mm</span>}
      <a
        href="https://open-meteo.com/"
        target="_blank"
        rel="noreferrer"
        aria-label="Dados meteorológicos fornecidos pela Open-Meteo"
        className="ml-0.5 text-[8px] text-sky-200/70 underline"
      >
        Open-Meteo
      </a>
    </div>
  );
}

