type MessageRound = {
  number: number;
  date: string;
  round_type: string;
  payment_pix?: string | null;
  payment_recipient_name?: string | null;
};

type MessagePlayer = {
  id: string;
  name: string;
  paid?: boolean;
};

type MessageObligation = {
  player_id: string;
  recipient_name: string;
  recipient_pix: string;
  amount_due: number;
  amount_paid: number;
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function roundTitle(round: MessageRound) {
  const date = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" })
    .format(new Date(`${round.date}T12:00:00`));
  const label = round.round_type === "friendly" ? "Amistoso" : `Rodada ${String(round.number).padStart(2, "0")}`;
  return `⚽ *Pelada BQ · ${label} · ${date}*`;
}

export function buildSimplePaymentWhatsAppMessage({
  round,
  players,
  amountByPlayer,
}: {
  round: MessageRound;
  players: MessagePlayer[];
  amountByPlayer: Record<string, number>;
}) {
  const recipient = round.payment_recipient_name?.trim() || "Administrador";
  const total = players.reduce((sum, player) => sum + Number(amountByPlayer[player.id] || 0), 0);

  return [
    roundTitle(round),
    "",
    "📋 *Valores por jogador*",
    ...players.map((player, index) => `${player.paid ? "✅" : "▫️"} ${index + 1}. ${player.name} — *${money.format(amountByPlayer[player.id] || 0)}*`),
    "",
    `💰 *Total:* ${money.format(total)}`,
    `💳 *PIX de ${recipient}:* ${round.payment_pix || "Não informado"}`,
  ].join("\n");
}

export function buildDetailedPaymentWhatsAppMessage({
  round,
  players,
  obligations,
}: {
  round: MessageRound;
  players: MessagePlayer[];
  obligations: MessageObligation[];
}) {
  const recipientMap = new Map<string, { name: string; pix: string }>();
  for (const item of obligations) {
    recipientMap.set(`${item.recipient_name}\u0000${item.recipient_pix}`, {
      name: item.recipient_name,
      pix: item.recipient_pix,
    });
  }

  const playerLines = players.flatMap((player, index) => {
    const rows = obligations.filter((item) => item.player_id === player.id);
    const total = rows.reduce((sum, item) => sum + Number(item.amount_due || 0), 0);
    const paid = rows.length > 0 && rows.every((item) => Number(item.amount_paid || 0) >= Number(item.amount_due || 0));
    const lines = [`${paid ? "✅" : "▫️"} ${index + 1}. ${player.name} — *${money.format(total)}*`];
    if (rows.length > 1) {
      lines.push(...rows.map((item) => `   ↳ ${item.recipient_name}: ${money.format(item.amount_due)}`));
    }
    return lines;
  });

  const total = obligations.reduce((sum, item) => sum + Number(item.amount_due || 0), 0);
  const pixLines = [...recipientMap.values()].map((recipient) => `💳 *PIX de ${recipient.name}:* ${recipient.pix}`);

  return [
    roundTitle(round),
    "",
    "📋 *Valores por jogador*",
    ...playerLines,
    "",
    `💰 *Total:* ${money.format(total)}`,
    ...pixLines,
  ].join("\n");
}
