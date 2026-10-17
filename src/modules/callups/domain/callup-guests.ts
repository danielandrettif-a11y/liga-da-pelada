export function cleanCallupGuestName(name: string): string | null {
  const cleanName = name.trim();
  return cleanName.length >= 2 ? cleanName : null;
}

export function canRemoveCreatedCallupEntry(
  userId: string,
  entry: { joinedBy: string | null; createdByUserId: string | null },
): boolean {
  return entry.joinedBy === userId || entry.createdByUserId === userId;
}
