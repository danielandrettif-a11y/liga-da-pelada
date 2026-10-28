import type { MemberCategory, PlayerProfile } from "./player-catalog.js";
import { InvalidPlayerManagementError } from "./player-management.js";

export type PlayerAvatarAsset = {
  slot: "active" | "alternate";
  contentType: "image/jpeg" | "image/png" | "image/webp";
  bytes: Uint8Array;
};

export type PlayerProfileForm = {
  name: string;
  nickname: string | null;
  profileBio: string | null;
  playerProfile: "offensive" | "defensive";
  overallTraits: ("offensive" | "defensive")[];
  memberCategory: MemberCategory;
  isSelectable: boolean;
  removeActiveAvatar: boolean;
  removeAlternateAvatar: boolean;
  useAlternateAvatar: boolean;
  activeAvatar: PlayerAvatarAsset | null;
  alternateAvatar: PlayerAvatarAsset | null;
};

export type CurrentEditablePlayer = {
  profileBio: string | null;
  avatarUrl: string | null;
  avatarAlternateUrl: string | null;
  memberCategory: MemberCategory;
  isSelectable: boolean;
  playerProfile: PlayerProfile | null;
  overallTraits: PlayerProfile[];
  isGoalkeeper: boolean;
};

export type PlayerProfileAccess = {
  isLeagueAdmin: boolean;
  isOwner: boolean;
  current: CurrentEditablePlayer | null;
};

export type SavePlayerProfileCommand = {
  playerId: string;
  name: string;
  nickname: string | null;
  profileBio: string | null;
  avatarUrl: string | null;
  avatarAlternateUrl: string | null;
  playerProfile: "offensive" | "defensive" | null;
  overallTraits: ("offensive" | "defensive")[];
  isGoalkeeper: boolean;
  memberCategory: MemberCategory;
  isSelectable: boolean;
};

function text(value: unknown, label: string, maximum: number, required = false): string | null {
  if (typeof value !== "string") {
    if (!required && (value === undefined || value === null)) return null;
    throw new InvalidPlayerManagementError(`${label} inválido.`);
  }
  const normalized = value.trim();
  if (required && !normalized) throw new InvalidPlayerManagementError(`${label} é obrigatório.`);
  if (normalized.length > maximum) {
    throw new InvalidPlayerManagementError(`${label} deve ter no máximo ${maximum} caracteres.`);
  }
  return normalized || null;
}

function profile(value: unknown): "offensive" | "defensive" {
  if (value === undefined || value === "offensive" || value === "midfield") return "offensive";
  if (value === "defensive") return "defensive";
  throw new InvalidPlayerManagementError("Escolha um perfil de jogo válido.");
}

function traits(value: unknown): ("offensive" | "defensive")[] {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  const normalized = values.flatMap((item) => {
    if (item === "midfield") return ["offensive" as const];
    if (item === "offensive" || item === "defensive") return [item];
    return [];
  });
  return [...new Set(normalized)].slice(0, 2);
}

function category(value: unknown): MemberCategory {
  if (value === "player" || value === "guest" || value === "wag" || value === "supporter") return value;
  throw new InvalidPlayerManagementError("Escolha uma categoria válida.");
}

function hasExpectedSignature(contentType: string, bytes: Uint8Array): boolean {
  if (contentType === "image/png") {
    return bytes.length >= 8
      && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((item, index) => bytes[index] === item);
  }
  if (contentType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/webp") {
    return bytes.length >= 12
      && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
      && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  return false;
}

function avatar(slot: PlayerAvatarAsset["slot"], value: {
  contentType: string; bytes: Uint8Array;
} | null | undefined): PlayerAvatarAsset | null {
  if (!value) return null;
  const accepted = value.contentType === "image/jpeg" || value.contentType === "image/png"
    || value.contentType === "image/webp";
  if (!accepted || value.bytes.byteLength === 0 || value.bytes.byteLength > 5 * 1024 * 1024
    || !hasExpectedSignature(value.contentType, value.bytes)) {
    throw new InvalidPlayerManagementError("Use uma imagem JPG, PNG ou WebP de até 5 MB.");
  }
  return { slot, contentType: value.contentType as PlayerAvatarAsset["contentType"], bytes: value.bytes };
}

export function parsePlayerProfileForm(input: Record<string, unknown> & {
  activeAvatar?: { contentType: string; bytes: Uint8Array } | null;
  alternateAvatar?: { contentType: string; bytes: Uint8Array } | null;
}): PlayerProfileForm {
  return {
    name: text(input.name, "O nome", 120, true)!,
    nickname: text(input.nickname, "O apelido", 60),
    profileBio: text(input.profile_bio, "O texto do perfil", 500),
    playerProfile: profile(input.player_profile),
    overallTraits: traits(input.overall_traits),
    memberCategory: category(input.member_category ?? "player"),
    isSelectable: input.is_selectable !== false && input.is_selectable !== "false",
    removeActiveAvatar: input.remove_active_avatar === true || input.remove_active_avatar === "true"
      || input.remove_avatar === true || input.remove_avatar === "true",
    removeAlternateAvatar: input.remove_alternate_avatar === true || input.remove_alternate_avatar === "true",
    useAlternateAvatar: input.use_alternate_avatar === true || input.use_alternate_avatar === "true",
    activeAvatar: avatar("active", input.activeAvatar),
    alternateAvatar: avatar("alternate", input.alternateAvatar),
  };
}

export function resolvePlayerProfileCommand(
  playerId: string,
  input: PlayerProfileForm,
  access: PlayerProfileAccess,
  avatarUrl: string | null,
  avatarAlternateUrl: string | null,
): SavePlayerProfileCommand {
  const creating = access.current === null;
  if (creating && !access.isLeagueAdmin) {
    throw new InvalidPlayerManagementError("Somente administradores podem criar jogadores.");
  }
  if (!creating && !access.isLeagueAdmin && !access.isOwner) {
    throw new InvalidPlayerManagementError("Você só pode editar o seu próprio perfil.");
  }
  if (access.isLeagueAdmin && input.memberCategory === "player"
    && (creating || access.current?.memberCategory !== "player")) {
    throw new InvalidPlayerManagementError("Jogadores oficiais precisam criar o próprio perfil ao entrar no app.");
  }

  const memberCategory = access.isLeagueAdmin
    ? input.memberCategory : access.current!.memberCategory;
  const isNonPlaying = memberCategory === "wag" || memberCategory === "supporter";
  return {
    playerId,
    name: input.name,
    nickname: input.nickname,
    profileBio: access.isLeagueAdmin ? input.profileBio : access.current!.profileBio,
    avatarUrl,
    avatarAlternateUrl,
    playerProfile: isNonPlaying ? null : access.isLeagueAdmin
      ? input.playerProfile : access.current!.playerProfile === "defensive" ? "defensive" : "offensive",
    overallTraits: isNonPlaying ? [] : access.isLeagueAdmin
      ? input.overallTraits : access.current!.overallTraits.filter((item) => item !== "midfield") as ("offensive" | "defensive")[],
    isGoalkeeper: isNonPlaying ? false : access.current?.isGoalkeeper ?? false,
    memberCategory,
    isSelectable: access.isLeagueAdmin
      ? isNonPlaying ? false : memberCategory === "guest" ? true : input.isSelectable
      : access.current!.isSelectable,
  };
}
