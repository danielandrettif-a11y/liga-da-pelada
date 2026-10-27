import type { MemberCategory } from "./player-catalog.js";

export type CreatePlayerCommand = {
  name: string;
  nickname: string | null;
  avatarUrl: string | null;
  playerProfile: "offensive" | "defensive";
  overallTraits: ("offensive" | "defensive")[];
  memberCategory: Exclude<MemberCategory, "player">;
  isSelectable: boolean;
};

export type UpdatePlayerCommand = {
  name?: string;
  nickname?: string | null;
  avatarUrl?: string | null;
  playerProfile?: "offensive" | "defensive";
  overallTraits?: ("offensive" | "defensive")[];
  memberCategory?: MemberCategory;
  isSelectable?: boolean;
};

export type ImportedGuest = {
  createdName: string;
  playerId: string;
  addedToCallup: boolean;
};

export class InvalidPlayerManagementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPlayerManagementError";
  }
}

export function parsePlayerManagementUuid(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalized)) {
    throw new InvalidPlayerManagementError(`${label} inválido.`);
  }
  return normalized;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidPlayerManagementError("Dados do jogador inválidos.");
  }
  return value as Record<string, unknown>;
}

function optionalText(value: unknown, label: string, maximum: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new InvalidPlayerManagementError(`${label} inválido.`);
  const normalized = value.trim();
  if (normalized.length > maximum) {
    throw new InvalidPlayerManagementError(`${label} deve ter no máximo ${maximum} caracteres.`);
  }
  return normalized || null;
}

function requiredName(value: unknown): string {
  const name = optionalText(value, "O nome", 120);
  if (!name) throw new InvalidPlayerManagementError("O nome é obrigatório.");
  return name;
}

function playerProfile(value: unknown): "offensive" | "defensive" {
  if (value === undefined || value === null || value === "offensive" || value === "midfield") return "offensive";
  if (value === "defensive") return "defensive";
  throw new InvalidPlayerManagementError("Escolha um perfil de jogo válido.");
}

function overallTraits(value: unknown): ("offensive" | "defensive")[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new InvalidPlayerManagementError("Características gerais inválidas.");
  const traits = value.flatMap((item) => {
    if (item === "midfield") return ["offensive" as const];
    if (item === "offensive" || item === "defensive") return [item];
    return [];
  });
  return [...new Set(traits)].slice(0, 2);
}

function memberCategory(value: unknown): MemberCategory {
  if (value === "player" || value === "guest" || value === "wag" || value === "supporter") return value;
  throw new InvalidPlayerManagementError("Escolha uma categoria válida.");
}

export function normalizeCreatePlayer(value: unknown): CreatePlayerCommand {
  const input = record(value);
  const category = memberCategory(input.member_category);
  if (category === "player") {
    throw new InvalidPlayerManagementError("Jogadores oficiais precisam criar o próprio perfil ao entrar no app.");
  }
  return {
    name: requiredName(input.name),
    nickname: optionalText(input.nickname, "O apelido", 60),
    avatarUrl: optionalText(input.avatar_url, "A URL da foto", 2_048),
    playerProfile: playerProfile(input.player_profile),
    overallTraits: overallTraits(input.overall_traits),
    memberCategory: category,
    isSelectable: category !== "wag" && category !== "supporter",
  };
}

export function normalizeUpdatePlayer(value: unknown): UpdatePlayerCommand {
  const input = record(value);
  const command: UpdatePlayerCommand = {};
  if (input.name !== undefined) command.name = requiredName(input.name);
  if (input.nickname !== undefined) command.nickname = optionalText(input.nickname, "O apelido", 60);
  if (input.avatar_url !== undefined) command.avatarUrl = optionalText(input.avatar_url, "A URL da foto", 2_048);
  if (input.player_profile !== undefined) command.playerProfile = playerProfile(input.player_profile);
  if (input.overall_traits !== undefined) command.overallTraits = overallTraits(input.overall_traits);
  if (input.member_category !== undefined) command.memberCategory = memberCategory(input.member_category);
  if (input.is_selectable !== undefined) {
    if (typeof input.is_selectable !== "boolean") {
      throw new InvalidPlayerManagementError("Disponibilidade do jogador inválida.");
    }
    command.isSelectable = input.is_selectable;
  }
  return command;
}

export function normalizeGuestNames(value: unknown): string[] {
  if (!Array.isArray(value)) throw new InvalidPlayerManagementError("Lista de convidados inválida.");
  const names = value
    .filter((name): name is string => typeof name === "string")
    .map((name) => name.trim().replace(/\s+/g, " "))
    .filter((name) => name.length >= 2)
    .map((name) => name.slice(0, 120));
  if (!names.length || names.length > 100) {
    throw new InvalidPlayerManagementError("Informe entre 1 e 100 nomes válidos.");
  }
  return names;
}
