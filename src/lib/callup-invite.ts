/**
 * Mantém o convite curto para o WhatsApp reconhecer a URL inteira. A rota
 * curta entrega a própria convocação por rewrite, sem trocar o endereço no
 * navegador e sem sair do escopo do PWA instalado.
 */
export function buildCallupInviteUrl(origin: string, inviteToken: string) {
  const url = new URL(`/c/${encodeURIComponent(inviteToken)}`, origin);
  return url.toString();
}

export async function shareCallupInvite(input: {
  title: string;
  text: string;
  url: string;
}): Promise<"shared" | "copied" | "cancelled"> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: input.title, text: input.text, url: input.url });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }

  await navigator.clipboard.writeText(`${input.url}\n\n${input.text}`);
  return "copied";
}
