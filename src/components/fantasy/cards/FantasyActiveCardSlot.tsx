"use client";

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { Lock, Sparkles, Trash2, X } from "@/components/icons";
import { RARITY_CONFIG } from "@/lib/fantasy/cards/config";
import { getCardArtUrl } from "@/lib/fantasy/cards/card-assets";
import type { FantasyActiveCardDTO } from "@/lib/actions/fantasy-cards";
import { removeActiveCardForRound } from "@/lib/actions/fantasy-cards";

const FantasyInventoryModal = dynamic(
  () => import("./FantasyInventoryModal").then((mod) => mod.FantasyInventoryModal),
  { ssr: false },
);

function preloadInventoryModal() {
  void import("./FantasyInventoryModal").then((mod) => mod.preloadFantasyInventory());
}

type Props = {
  roundId: string | null;
  activeCard: FantasyActiveCardDTO | null;
  isMarketOpen: boolean;
  isRoundLive?: boolean;
  liveStats?: Array<{
    playerId: string;
    goals: number;
    assists: number;
    wins: number;
    games: number;
    basePoints: number;
  }>;
  onRefresh?: () => void;
  marketPlayers?: Array<{ id: string; name: string; price: number }>;
  lineupPlayers?: Array<{ id: string; name: string; price: number }>;
  captainPlayerId?: string | null;
};

type CardLiveProgress = {
  label: string;
  detail: string;
  done?: boolean;
};

function getCardLiveProgress(
  card: FantasyActiveCardDTO,
  stats: Props["liveStats"],
  marketPlayers: NonNullable<Props["marketPlayers"]>,
  lineupPlayers: NonNullable<Props["lineupPlayers"]>,
  captainPlayerId: string | null,
): CardLiveProgress {
  const byId = new Map((stats || []).map((item) => [item.playerId, item]));
  const get = (playerId?: string | null) => byId.get(playerId || "") || {
    playerId: playerId || "",
    goals: 0,
    assists: 0,
    wins: 0,
    games: 0,
    basePoints: 0,
  };
  const nameOf = (playerId?: string | null, fallback?: string | null) =>
    fallback || marketPlayers.find((player) => player.id === playerId)?.name || "Jogador";
  const config = card.card.effectConfig || {};
  const target = get(card.targetPlayerId);
  const targetName = nameOf(card.targetPlayerId, card.targetPlayerName);
  const secondTarget = get(card.targetPlayer2Id);
  const secondTargetName = nameOf(card.targetPlayer2Id, card.targetPlayer2Name);
  const all = [...byId.values()];
  const rankOf = (item: typeof target) => 1 + all.filter((entry) => entry.basePoints > item.basePoints).length;

  if (card.card.slug === "double_prediction") {
    const firstDone = target.goals >= 2;
    const secondDone = secondTarget.assists >= 2;
    return {
      label: `${Number(target.goals || 0)}/2 gols · ${Number(secondTarget.assists || 0)}/2 assistências`,
      detail: `${targetName} marca gols; ${secondTargetName} dá assistências.`,
      done: firstDone && secondDone,
    };
  }

  if (config.metric === "goals" || config.metric === "assists") {
    const metric = config.metric === "goals" ? "gols" : "assistências";
    const current = config.metric === "goals" ? target.goals : target.assists;
    const required = Number(config.threshold || 1);
    return {
      label: `${current}/${required} ${metric}`,
      detail: `${targetName} precisa de ${required} ${metric}.`,
      done: current >= required,
    };
  }

  if (card.card.slug === "triple_crown") {
    return {
      label: `${target.goals}/1 gol · ${target.assists}/1 assistência · ${target.wins}/1 vitória`,
      detail: `${targetName} precisa completar os três requisitos.`,
      done: target.goals >= 1 && target.assists >= 1 && target.wins >= 1,
    };
  }

  if (card.card.slug === "so_vim_pela_resenha") {
    return {
      label: `${target.wins}/2 vitórias · ${target.goals} gols · ${target.assists} assistências`,
      detail: `${targetName} precisa de 2 vitórias sem gol ou assistência.`,
      done: target.wins >= 2 && target.goals === 0 && target.assists === 0,
    };
  }

  if (card.card.slug === "all_in" || card.card.slug === "bagre_or_craque") {
    const maxRank = Number(config.topRank || 5);
    const rank = rankOf(target);
    return {
      label: `${rank}º / TOP ${maxRank}`,
      detail: `${targetName} tem ${target.basePoints.toFixed(1)} pts-base na rodada.`,
      done: target.games > 0 && rank <= maxRank,
    };
  }

  if (card.card.slug === "super_captain") {
    const captain = get(captainPlayerId);
    const captainName = nameOf(captainPlayerId);
    const extra = Math.min(Number(config.maxBonus || 8), Math.max(0, captain.basePoints));
    return {
      label: `${captain.basePoints.toFixed(1)} pts-base · +${extra.toFixed(1)} extra`,
      detail: `Capitão ${captainName}; o adicional é limitado a +${Number(config.maxBonus || 8).toFixed(0)}.`,
      done: captain.basePoints > 0,
    };
  }

  if (card.card.slug === "vice_captain") {
    const captain = get(captainPlayerId);
    const viceWins = target.basePoints > captain.basePoints;
    return {
      label: `${target.basePoints.toFixed(1)} x ${captain.basePoints.toFixed(1)} pts-base`,
      detail: `${targetName} precisa superar o capitão para assumir a braçadeira.`,
      done: viceWins,
    };
  }

  if (card.card.slug === "duo") {
    const average = all.length
      ? all.reduce((sum, item) => sum + item.basePoints, 0) / all.length
      : 0;
    return {
      label: `${target.basePoints.toFixed(1)} e ${secondTarget.basePoints.toFixed(1)} pts · média ${average.toFixed(1)}`,
      detail: `${targetName} e ${secondTargetName} precisam ficar acima da média.`,
      done: target.games > 0 && secondTarget.games > 0 && target.basePoints > average && secondTarget.basePoints > average,
    };
  }

  if (card.card.slug === "scout") {
    const maxBonus = Number(config.maxBonus || 6);
    const estimated = Math.min(maxBonus, Math.max(0, target.basePoints * Number(config.percentage || 0.5)));
    return {
      label: `${target.basePoints.toFixed(1)} pts-base → +${estimated.toFixed(1)} estimado`,
      detail: `${targetName}: 50% dos pontos-base, limitado a +${maxBonus}.`,
      done: target.basePoints > 0,
    };
  }

  if (card.card.slug === "dream_team") {
    const maxRank = Number(config.allPlayersTopRank || 8);
    const inside = lineupPlayers.filter((player) => {
      const stat = get(player.id);
      return stat.games > 0 && rankOf(stat) <= maxRank;
    }).length;
    return {
      label: `${inside}/${lineupPlayers.length} no TOP ${maxRank}`,
      detail: "Todos os atletas escalados precisam terminar dentro da faixa.",
      done: lineupPlayers.length > 0 && inside === lineupPlayers.length,
    };
  }

  if (card.card.effectType === "PLAYER_SCORE_PROTECTION") {
    return {
      label: `${target.basePoints.toFixed(1)} pts-base`,
      detail: `${targetName}: a proteção será aplicada se a condição final for atingida.`,
      done: target.basePoints < 0,
    };
  }

  if (card.card.effectType === "PLAYER_VALUE_SHIELD") {
    return {
      label: "Aguardando valorização final",
      detail: `${targetName}: a recuperação é calculada ao fechar a rodada.`,
    };
  }

  return {
    label: "Em acompanhamento",
    detail: "O resultado da carta será consolidado ao final da rodada.",
  };
}

export function FantasyActiveCardSlot({
  roundId,
  activeCard,
  isMarketOpen,
  isRoundLive = false,
  liveStats = [],
  onRefresh,
  marketPlayers = [],
  lineupPlayers = [],
  captainPlayerId = null,
}: Props) {
  const [showInventory, setShowInventory] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleRemove() {
    if (!roundId) return;
    startTransition(async () => {
      await removeActiveCardForRound(roundId);
      onRefresh?.();
    });
  }

  if (!roundId) return null;

  const cardProgress = activeCard && isRoundLive
    ? getCardLiveProgress(activeCard, liveStats, marketPlayers, lineupPlayers, captainPlayerId)
    : null;

  return (
    <>
      <section className="glass-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">🃏</span>
            <h3 className="text-xs font-black uppercase tracking-wider text-foreground">
              Carta Especial da Rodada
            </h3>
          </div>
          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-accent">
            Máx 1 por Rodada
          </span>
        </div>

        {activeCard ? (
          /* CARTA ATIVA CONFIGURADA */
          <div
            className={`flex flex-col gap-3 rounded-2xl border p-3.5 ${
              RARITY_CONFIG[activeCard.card.rarity].border
            } ${RARITY_CONFIG[activeCard.card.rarity].bg} shadow-md`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {getCardArtUrl(activeCard.card.slug) ? (
                  <div className="relative h-16 w-11 shrink-0 rounded-xl overflow-hidden border border-amber-400/40 shadow-lg">
                    <Image
                      src={getCardArtUrl(activeCard.card.slug)!}
                      alt={activeCard.card.name}
                      fill
                      sizes="50px"
                      loading="lazy"
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <span className="text-3xl shrink-0">{activeCard.card.icon}</span>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4
                      className={`truncate text-sm font-black uppercase italic ${
                        RARITY_CONFIG[activeCard.card.rarity].text
                      }`}
                    >
                      {activeCard.card.name}
                    </h4>
                    <span
                      className={`rounded px-1.5 py-0.2 text-[7px] font-black uppercase ${
                        RARITY_CONFIG[activeCard.card.rarity].badgeBg
                      }`}
                    >
                      {RARITY_CONFIG[activeCard.card.rarity].label}
                    </span>
                    {!isMarketOpen && (
                      <span className="rounded bg-black/40 px-1.5 py-0.2 text-[7px] font-black text-warning flex items-center gap-0.5">
                        <Lock className="h-2.5 w-2.5 inline" /> Travada
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted leading-tight">
                    {activeCard.card.description}
                  </p>
                </div>
              </div>

              {/* Ações (Trocar / Remover) */}
              {isMarketOpen && (
                <div className="flex items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/5 shrink-0 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setShowInventory(true)}
                    onPointerEnter={preloadInventoryModal}
                    onFocus={preloadInventoryModal}
                    onTouchStart={preloadInventoryModal}
                    className="rounded-xl border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase text-white hover:bg-white/20 transition-colors"
                  >
                    Trocar
                  </button>
                  <button
                    type="button"
                    onClick={handleRemove}
                    disabled={pending}
                    className="rounded-xl border border-danger/30 bg-danger/10 px-2.5 py-1.5 text-[10px] font-black uppercase text-danger hover:bg-danger/20 transition-colors"
                    title="Remover carta ativa"
                    aria-label="Remover carta ativa"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* DESTAQUE DO JOGADOR SELECIONADO NA CARTA */}
            {(activeCard.targetPlayerId || activeCard.targetPlayer2Id || activeCard.targetPrediction) && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs">
                {activeCard.targetPlayerId && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-accent font-black">🎯 Jogador Selecionado:</span>
                    <span className="font-black text-foreground underline decoration-accent/50 underline-offset-2">
                      {activeCard.targetPlayerName ||
                        marketPlayers.find((p) => p.id === activeCard.targetPlayerId)?.name ||
                        "Jogador escolhido"}
                    </span>
                  </div>
                )}
                {activeCard.targetPlayer2Id && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted font-bold">&</span>
                    <span className="font-black text-foreground underline decoration-accent/50 underline-offset-2">
                      {activeCard.targetPlayer2Name ||
                        marketPlayers.find((p) => p.id === activeCard.targetPlayer2Id)?.name ||
                        "2º Jogador"}
                    </span>
                  </div>
                )}
                {activeCard.targetPrediction && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-warning font-black">🔮 Palpite:</span>
                    <span className="font-black text-foreground">
                      {activeCard.targetPrediction === "TOP_SCORER"
                        ? "Artilheiro da Rodada"
                        : activeCard.targetPrediction === "TOP_ASSIST"
                        ? "Líder de Assistências"
                        : "Cumprir Desafio"}
                    </span>
                  </div>
                )}
              </div>
            )}

            {cardProgress && (
              <div className={`rounded-xl border px-3 py-2.5 ${
                cardProgress.done
                  ? "border-success/35 bg-success/10"
                  : "border-accent/25 bg-black/25"
              }`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[9px] font-black uppercase tracking-wider text-accent">Progresso ao vivo</span>
                  <strong className={cardProgress.done ? "text-[10px] font-black text-success" : "text-[10px] font-black text-foreground"}>
                    {cardProgress.done ? "Condição atingida" : cardProgress.label}
                  </strong>
                </div>
                {cardProgress.done && <p className="mt-1 text-xs font-bold text-success">{cardProgress.label}</p>}
                <p className="mt-1 text-[10px] leading-4 text-muted">{cardProgress.detail}</p>
              </div>
            )}
          </div>
        ) : (
          /* NENHUMA CARTA ATIVA */
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-white/20 bg-black/20 p-3.5">
            <div className="min-w-0">
              <p className="text-xs font-black text-foreground">Nenhuma carta ativa</p>
              <p className="text-[10px] text-muted">
                Ative uma carta do seu inventário para ganhar bônus exclusivos nesta rodada.
              </p>
            </div>

            {isMarketOpen && (
              <button
                    type="button"
                    onClick={() => setShowInventory(true)}
                    onPointerEnter={preloadInventoryModal}
                    onFocus={preloadInventoryModal}
                    onTouchStart={preloadInventoryModal}
                className="shrink-0 flex items-center gap-1 rounded-xl bg-accent px-3 py-2 text-[10px] font-black uppercase tracking-wider text-background shadow-[0_0_15px_rgba(204,255,0,0.2)] hover:brightness-110 active:scale-95 transition-all"
              >
                <Sparkles className="h-3 w-3" />
                <span>Escolher Carta</span>
              </button>
            )}
          </div>
        )}
      </section>

      {/* Modal de Inventário */}
      {showInventory && (
        <FantasyInventoryModal
          isOpen={showInventory}
          onClose={() => setShowInventory(false)}
          roundId={roundId}
          isMarketOpen={isMarketOpen}
          marketPlayers={marketPlayers}
          lineupPlayers={lineupPlayers}
          captainPlayerId={captainPlayerId}
          onCardActivated={() => {
            onRefresh?.();
          }}
        />
      )}
    </>
  );
}
