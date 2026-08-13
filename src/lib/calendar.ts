export type PeladaCalendarEvent = {
  title: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  location?: string | null;
  mapUrl?: string | null;
  appUrl?: string | null;
};

function compact(value: Date) {
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${value.getFullYear()}${pad(value.getMonth() + 1)}${pad(value.getDate())}T${pad(value.getHours())}${pad(value.getMinutes())}00`;
}

function dates(event: PeladaCalendarEvent) {
  const start = new Date(`${event.date}T${event.startTime}:00`);
  const end = new Date(start.getTime() + event.durationMinutes * 60_000);
  return { start, end };
}

function description(event: PeladaCalendarEvent, origin: string) {
  const appUrl = event.appUrl?.startsWith("/") ? `${origin}${event.appUrl}` : event.appUrl;
  return [event.mapUrl ? `Mapa: ${event.mapUrl}` : "", appUrl ? `Pelada BQ: ${appUrl}` : ""].filter(Boolean).join("\n");
}

function escapeIcs(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export function buildGoogleCalendarUrl(event: PeladaCalendarEvent, origin: string) {
  const { start, end } = dates(event);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${compact(start)}/${compact(end)}`,
    ctz: "America/Sao_Paulo",
    details: description(event, origin),
    location: event.location || event.mapUrl || "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildIcs(event: PeladaCalendarEvent, origin: string, now = new Date()) {
  const { start, end } = dates(event);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Pelada BQ//Agenda//PT-BR",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${event.date}-${event.startTime.replace(":", "")}@peladabq`,
    `DTSTAMP:${compact(now)}`,
    `DTSTART;TZID=America/Sao_Paulo:${compact(start)}`,
    `DTEND;TZID=America/Sao_Paulo:${compact(end)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    `DESCRIPTION:${escapeIcs(description(event, origin))}`,
    `LOCATION:${escapeIcs(event.location || event.mapUrl || "")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
