export type AccountRole = "admin" | "player";

export type ManagedAccount = {
  userId: string;
  role: AccountRole;
  createdAt: string;
  player: {
    id: string;
    name: string;
    nickname: string | null;
    avatarUrl: string | null;
  } | null;
};

export class InvalidAccountAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAccountAccessError";
  }
}

export function parseAccountId(value: string): string {
  const accountId = value.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(accountId)) {
    throw new InvalidAccountAccessError("Escolha uma conta cadastrada.");
  }
  return accountId;
}

export function accountRole(makeAdmin: boolean): AccountRole {
  return makeAdmin ? "admin" : "player";
}
