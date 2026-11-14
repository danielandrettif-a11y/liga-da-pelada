import type { MemberCategory } from "@/lib/types";

/**
 * Administradores continuam sem poder criar um jogador oficial sem conta,
 * mas podem promover um convidado existente preservando o mesmo perfil e
 * todo o seu historico esportivo.
 */
export function canAdminAssignOfficialCategory(
  playerId: string | null | undefined,
  currentCategory: MemberCategory | null | undefined,
) {
  return Boolean(playerId)
    && (currentCategory === "player" || currentCategory === "guest");
}
