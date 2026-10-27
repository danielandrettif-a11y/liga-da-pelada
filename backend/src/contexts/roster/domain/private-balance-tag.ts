export const privateBalanceTags = ["bagre_1", "bagre_2", "craque_1", "craque_2"] as const;
export type PrivateBalanceTag = typeof privateBalanceTags[number];

export class InvalidPrivateBalanceTagError extends Error {
  constructor(message = "Classificação de equilíbrio inválida.") {
    super(message);
    this.name = "InvalidPrivateBalanceTagError";
  }
}

export function parsePlayerId(value: string): string {
  const playerId = value.trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId)) {
    throw new InvalidPrivateBalanceTagError("Jogador inválido.");
  }
  return playerId;
}

export function parsePrivateBalanceTag(value: unknown): PrivateBalanceTag | null {
  if (value === null) return null;
  if (typeof value !== "string" || !privateBalanceTags.includes(value as PrivateBalanceTag)) {
    throw new InvalidPrivateBalanceTagError();
  }
  return value as PrivateBalanceTag;
}
