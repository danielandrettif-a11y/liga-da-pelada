export type PlayerRegistrationEvent = {
  id: number;
  player_id: string | null;
  player_name: string;
  avatar_url: string | null;
  member_category: "player" | "guest" | "wag" | "supporter";
  source: "legacy" | "site_signup" | "admin";
  created_by_user_id: string | null;
  created_at: string;
};

export class InvalidRosterRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRosterRegistrationError";
  }
}

export function parseRosterRegistrationUuid(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalized)) {
    throw new InvalidRosterRegistrationError(`${label} inválido.`);
  }
  return normalized;
}

export function validatePlayerMergeIds(guestId: string, registeredId: string): {
  guestId: string;
  registeredId: string;
} {
  const cleanGuest = parseRosterRegistrationUuid(guestId, "Jogador convidado");
  const cleanRegistered = parseRosterRegistrationUuid(registeredId, "Jogador cadastrado");
  if (cleanGuest === cleanRegistered) {
    throw new InvalidRosterRegistrationError("Escolha dois perfis diferentes.");
  }
  return { guestId: cleanGuest, registeredId: cleanRegistered };
}
