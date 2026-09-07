import { cosmeticNameplateClass, cosmeticNameplateImage } from "@/lib/fantasy/cosmetics";

type NameplateMeta = {
  kicker: string;
  mark: string;
};

function nameplateMeta(assetKey?: string | null): NameplateMeta {
  const key = (assetKey || "").toLowerCase();
  if (key.includes("ficha-vestiario")) return { kicker: "Vestiário BQ", mark: "10" };
  if (key.includes("placar-quadra")) return { kicker: "Placar da quadra", mark: "●" };
  if (key.includes("faixa-torcida")) return { kicker: "Torcida presente", mark: "BQ" };
  if (key.includes("prancheta-tatica")) return { kicker: "Plano de jogo", mark: "4-3-3" };
  if (key.includes("sumula-juiz")) return { kicker: "Súmula oficial", mark: "✓" };
  if (key.includes("placa-substituicao")) return { kicker: "Mudou o jogo", mark: "↗" };
  if (key.includes("portao-campinho")) return { kicker: "Portão do campinho", mark: "BQ" };
  if (key.includes("lenda-campinho")) return { kicker: "Lenda do campinho", mark: "★" };
  return { kicker: "Pelada BQ", mark: "XI" };
}

export function CosmeticNameplate({
  assetKey,
  playerName,
  titleName,
  compact = false,
  className = "",
}: {
  assetKey?: string | null;
  playerName: string;
  titleName?: string | null;
  compact?: boolean;
  className?: string;
}) {
  const meta = nameplateMeta(assetKey);
  const artwork = cosmeticNameplateImage(assetKey);

  return (
    <div
      className={`${cosmeticNameplateClass(assetKey)} ${artwork ? "cosmetic-nameplate--art" : ""} ${compact ? "cosmetic-nameplate--compact" : ""} ${className}`}
      data-long-name={playerName.trim().length > 18 ? "true" : undefined}
      style={artwork ? { backgroundImage: `url(${artwork})` } : undefined}
    >
      <div className="cosmetic-nameplate__header">
        <span>{meta.kicker}</span>
        <b aria-hidden="true">{meta.mark}</b>
      </div>
      <strong className="cosmetic-nameplate__player">{playerName}</strong>
      {titleName && <span className="cosmetic-nameplate__title">✦ {titleName}</span>}
      <span aria-hidden="true" className="cosmetic-nameplate__edge cosmetic-nameplate__edge--left" />
      <span aria-hidden="true" className="cosmetic-nameplate__edge cosmetic-nameplate__edge--right" />
    </div>
  );
}
