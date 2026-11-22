export type ImportedGuest = {
  createdName: string;
  playerId: string;
  addedToCallup: boolean;
};

export function isImportedGuest(value: unknown): value is ImportedGuest {
  if (!value || typeof value !== "object") return false;
  const guest = value as Record<string, unknown>;
  return typeof guest.createdName === "string" && typeof guest.playerId === "string"
    && typeof guest.addedToCallup === "boolean";
}
