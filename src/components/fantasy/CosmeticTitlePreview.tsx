import type { CosmeticItem } from "@/lib/fantasy/cosmetics";

type PreviewConfig = {
  symbol: string;
  kicker: string;
  tone: "gold" | "green" | "blue" | "purple" | "orange" | "red" | "pink" | "silver";
};

const TITLE_PREVIEWS: Array<{ match: string; config: PreviewConfig }> = [
  { match: "rei", config: { symbol: "♛", kicker: "Realeza do pós-jogo", tone: "gold" } },
  { match: "resenha", config: { symbol: "☻", kicker: "Resenha garantida", tone: "green" } },
  { match: "xerife", config: { symbol: "★", kicker: "Dono da defesa", tone: "blue" } },
  { match: "maestro", config: { symbol: "♫", kicker: "Visão de jogo", tone: "purple" } },
  { match: "camisa10", config: { symbol: "10", kicker: "A bola procura", tone: "gold" } },
  { match: "bagre", config: { symbol: "🐟", kicker: "Premium até no erro", tone: "pink" } },
  { match: "alergico", config: { symbol: "⚠", kicker: "Gol não encontrado", tone: "orange" } },
  { match: "inimigo-marcacao", config: { symbol: "↗", kicker: "Longe da marcação", tone: "green" } },
  { match: "canela-vidro", config: { symbol: "+", kicker: "Departamento médico", tone: "red" } },
  { match: "aquecimento", config: { symbol: "🔥", kicker: "Craque antes do apito", tone: "orange" } },
  { match: "alongamento", config: { symbol: "∞", kicker: "Flexibilidade máxima", tone: "blue" } },
  { match: "quase-gol", config: { symbol: "⊘", kicker: "A trave conhece", tone: "silver" } },
  { match: "alta-intensidade", config: { symbol: "05'", kicker: "Explosão com prazo", tone: "red" } },
  { match: "driblador", config: { symbol: "〽", kicker: "Foi sem querer", tone: "purple" } },
  { match: "cardio", config: { symbol: "▰", kicker: "Carga em andamento", tone: "orange" } },
  { match: "wifi", config: { symbol: "⌁", kicker: "Sinal intermitente", tone: "blue" } },
  { match: "presenca", config: { symbol: "✓", kicker: "Check-in confirmado", tone: "green" } },
  { match: "titular-opcao", config: { symbol: "XI", kicker: "Sobrou uma vaga", tone: "silver" } },
  { match: "overall", config: { symbol: "??", kicker: "Scout sob análise", tone: "purple" } },
  { match: "contratacao-dvd", config: { symbol: "▶", kicker: "Melhores momentos", tone: "pink" } },
];

function titlePreviewConfig(assetKey: string): PreviewConfig {
  const key = assetKey.toLowerCase();
  return TITLE_PREVIEWS.find((preview) => key.includes(preview.match))?.config
    || { symbol: "✦", kicker: "Título do jogador", tone: "green" };
}

export function CosmeticTitlePreview({ item, compact = false, className = "" }: { item: CosmeticItem; compact?: boolean; className?: string }) {
  const preview = titlePreviewConfig(item.assetKey);

  return (
    <div className={`cosmetic-title-preview cosmetic-title-preview--${preview.tone} ${compact ? "cosmetic-title-preview--compact" : ""} ${className}`}>
      <span aria-hidden="true" className="cosmetic-title-preview__pattern" />
      <div className="cosmetic-title-preview__content">
        <span aria-hidden="true" className="cosmetic-title-preview__symbol">{preview.symbol}</span>
        <span className="cosmetic-title-preview__player">Jogador BQ</span>
        <strong className="cosmetic-title-preview__name">✦ {item.name}</strong>
        <span className="cosmetic-title-preview__kicker">{preview.kicker}</span>
      </div>
    </div>
  );
}
