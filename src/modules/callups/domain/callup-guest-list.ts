export const MAX_CALLUP_GUEST_LIST_SIZE = 40;

export type ParsedCallupGuest = {
  name: string;
  isGoalkeeper: boolean;
};

const LIST_HEADING_PATTERNS = [
  /^lista\s+de\s+espera$/i,
  /^fila\s+de\s+espera$/i,
  /^confirmados?$/i,
  /^lista\s+de\s+confirmados?$/i,
  /^titulares?$/i,
  /^reservas?$/i,
  /^convoca[cç][aã]o(?:\s+aberta)?$/i,
];

export function normalizeCallupGuestName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function cleanWhatsAppLine(rawLine: string): ParsedCallupGuest | null {
  let line = rawLine.trim();
  if (!line) return null;

  const isGoalkeeper = /🧤|\b(?:goleiro|gol|gk)\b/i.test(line);

  line = line
    .replace(/^>\s*/, "")
    .replace(/^[*_~`]+|[*_~`]+$/g, "")
    .replace(/^[0-9]\uFE0F?\u20E3\s*[.)°º:\-–—]?\s*/u, "")
    .replace(/^(?:✅|☑️?|✔️?|⚽|👤|🧤|•|▪|▫|[-–—*])\s*/u, "")
    .replace(/^\d{1,3}\s*(?:[.)°º:\-–—]|\s)\s*/, "")
    .replace(/(?:\s*[-–—|·]\s*)?(?:🧤|\((?:goleiro|gol|gk)\)|\[(?:goleiro|gol|gk)\])\s*$/iu, "")
    .replace(/(?:✅|☑️?|✔️?)\s*$/u, "")
    .replace(/^[*_~`]+|[*_~`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!line || LIST_HEADING_PATTERNS.some((pattern) => pattern.test(line))) return null;
  if (/^(?:https?:\/\/|www\.)/i.test(line)) return null;
  if (/^\d{1,2}[\/:]\d{1,2}(?:[\/:]\d{2,4})?(?:\s*[-–—]\s*\d{1,2}:\d{2})?$/i.test(line)) return null;
  if (/pelada\s+bq/i.test(line) && /\d{1,2}[\/:]\d{1,2}|\d{1,2}:\d{2}/.test(line)) return null;

  const name = line.slice(0, 120).trim();
  const letters = name.match(/\p{L}/gu) || [];
  if (letters.length < 2) return null;
  return { name, isGoalkeeper };
}

export function parseWhatsAppGuestList(text: string): ParsedCallupGuest[] {
  const seen = new Set<string>();
  const guests: ParsedCallupGuest[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const guest = cleanWhatsAppLine(rawLine);
    if (!guest) continue;
    const key = normalizeCallupGuestName(guest.name);
    if (seen.has(key)) continue;
    seen.add(key);
    guests.push(guest);
  }

  return guests;
}
