import { SITE_URL } from "@/lib/siteUrl";

/**
 * Mantém o convite curto o bastante para os mensageiros não separarem os
 * parâmetros da URL. O token é aleatório e único por convocação; o servidor
 * resolve a convocação ao receber o link.
 */
export function buildCallupInviteUrl(inviteToken: string) {
  return `${SITE_URL}/c/${encodeURIComponent(inviteToken)}`;
}
