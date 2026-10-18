/** Endereço canônico e curto da convocação. */
export function buildCallupInviteUrl(origin: string, inviteToken: string) {
  const url = new URL(`/c/${encodeURIComponent(inviteToken)}`, origin);
  return url.toString();
}

export function buildCallupInviteMessage(input: {
  url: string;
  heading: string;
  roundLabel: string;
  date: string;
  time: string;
  stadiumName?: string | null;
}) {
  const venue = input.stadiumName ? `\n📍 *Local:* ${input.stadiumName}` : "";

  // O convite do app precisa ser o primeiro e único URL da mensagem. O
  // WhatsApp usa o primeiro URL para montar a prévia; um link do Maps aqui
  // roubaria a imagem e o destino do cartão. O mapa continua na página.
  return `${input.url}\n\n⚽ *${input.heading}*\n\n🏆 *${input.roundLabel}*\n📅 *Data:* ${input.date}\n⏰ *Horário:* ${input.time}${venue}\n\n👉 Abra o link acima para confirmar sua presença e ver a lista.`;
}

export async function shareCallupInvite(input: {
  title: string;
  text: string;
}): Promise<"shared" | "copied" | "cancelled"> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      // Enviar uma única string impede que alguns clientes do WhatsApp no iOS
      // movam a URL para o fim e reconheçam apenas o último trecho do caminho.
      await navigator.share({ title: input.title, text: input.text });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }

  await navigator.clipboard.writeText(input.text);
  return "copied";
}
