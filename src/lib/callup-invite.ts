/**
 * Mantém o convite curto para o WhatsApp reconhecer a URL inteira. A rota
 * curta entrega a própria convocação por rewrite, sem trocar o endereço no
 * navegador e sem sair do escopo do PWA instalado.
 */
export function buildCallupInviteUrl(origin: string, inviteToken: string) {
  const url = new URL(`/c/${encodeURIComponent(inviteToken)}`, origin);
  return url.toString();
}
