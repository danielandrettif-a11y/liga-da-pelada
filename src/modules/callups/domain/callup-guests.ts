export function cleanCallupGuestName(name: string): string | null {
  const cleanName = name.trim();
  return cleanName.length >= 2 ? cleanName : null;
}
