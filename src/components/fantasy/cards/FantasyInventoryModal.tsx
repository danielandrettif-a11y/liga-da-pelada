"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { CheckCircle2, Loader2, Sparkles, X } from "@/components/icons";
import { RARITY_CONFIG, type FantasyCardRarity } from "@/lib/fantasy/cards/config";
import {
  FANTASY_CARDS_CATALOG,
  type FantasyCardDefinition,
} from "@/lib/fantasy/cards/catalog";
import { getCardArtUrl } from "@/lib/fantasy/cards/card-assets";
import { filterFantasyCardTargets } from "@/lib/fantasy/cards/eligibility";
import type { FantasyUserCardDTO } from "@/lib/actions/fantasy-cards";
import { activateCardForRound, getMyInventory } from "@/lib/actions/fantasy-cards";
import { useDialogViewport } from "@/lib/useDialogViewport";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  roundId?: string | null;
  isMarketOpen?: boolean;
  onCardActivated?: () => void;
  marketPlayers?: Array<{ id: string; name: string; price: number }>;
  lineupPlayers?: Array<{ id: string; name: string; price: number }>;
  captainPlayerId?: string | null;
};

type InventoryData = {
  cards: FantasyUserCardDTO[];
  groupedBySlug: Record<string, { count: number; card: FantasyCardDefinition; instances: FantasyUserCardDTO[] }>;
  availableCount: number;
};

// O inventário é pessoal, então este cache só vive na aba atual do navegador.
// Ele elimina a segunda espera ao fechar e abrir o modal novamente.
let cachedInventory: InventoryData | null = null;
let inventoryRequest: Promise<InventoryData> | null = null;

export function preloadFantasyInventory({ force = false }: { force?: boolean } = {}) {
  if (!force && cachedInventory) return Promise.resolve(cachedInventory);
  if (!force && inventoryRequest) return inventoryRequest;

  inventoryRequest = getMyInventory()
    .then((data) => {
      cachedInventory = data;
      return data;
    })
    .finally(() => {
      inventoryRequest = null;
    });

  return inventoryRequest;
}

export function invalidateFantasyInventory() {
  cachedInventory = null;
}

export function FantasyInventoryModal({
  isOpen,
  onClose,
  roundId,
  isMarketOpen = true,
  onCardActivated,
  marketPlayers = [],
  lineupPlayers = [],
  captainPlayerId = null,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inventoryData, setInventoryData] = useState<InventoryData | null>(() => cachedInventory);
  const [rarityFilter, setRarityFilter] = useState<string>("ALL");
  const [showCatalog, setShowCatalog] = useState(false);
  const [previewCard, setPreviewCard] = useState<FantasyCardDefinition | null>(null);
  const [selectedToUse, setSelectedToUse] = useState<{
    card: FantasyCardDefinition;
    instance: FantasyUserCardDTO;
  } | null>(null);
  const [targetPlayerId, setTargetPlayerId] = useState<string>("");
  const [targetPlayer2Id, setTargetPlayer2Id] = useState<string>("");
  const [targetPrediction, setTargetPrediction] = useState<"TOP_SCORER" | "TOP_ASSIST" | "CHALLENGE">("TOP_SCORER");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useDialogViewport(isOpen);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setLoading(!cachedInventory);
      preloadFantasyInventory()
        .then((res) => setInventoryData(res))
        .catch(() => setInventoryData(null))
        .finally(() => setLoading(false));
    } else {
      setSelectedToUse(null);
      setShowCatalog(false);
      setPreviewCard(null);
      setError(null);
    }
  }, [isOpen]);

  if (!mounted || !isOpen || typeof document === "undefined") return null;

  const grouped = inventoryData?.groupedBySlug || {};
  const groupsList = Object.values(grouped).filter((item) => {
    if (rarityFilter === "ALL") return true;
    return item.card.rarity === rarityFilter;
  });
  const catalogCards = FANTASY_CARDS_CATALOG.filter((card) =>
    card.enabled && (rarityFilter === "ALL" ? true : card.rarity === rarityFilter),
  );

  /**
   * Retorna os jogadores elegíveis para o alvo da carta selecionada.
   * - Para Vice-Capitão: apenas jogadores escalados no time, excluindo o capitão oficial.
   * - Para Dobradinha: apenas jogadores escalados no time.
   * - Para Palpite Duplo: qualquer jogador do mercado.
   * - Para cartas de escalação (ANY_IN_LINEUP): jogadores escalados no time.
   * - Para cartas gerais: jogadores do mercado.
   */
  function getEligiblePlayers(card: FantasyCardDefinition) {
    if (card.slug === "vice_captain") {
      return lineupPlayers.filter((p) => p.id !== captainPlayerId);
    }
    if (card.slug === "double_prediction" || card.slug === "bargain" || card.slug === "all_in") {
      return marketPlayers;
    }
    if (card.slug === "duo") {
      return lineupPlayers;
    }
    if (card.targetFilter === "BELOW_MEDIAN_PRICE" || card.targetFilter === "CHEAPEST_50_PERCENT") {
      return filterFantasyCardTargets(card, lineupPlayers, marketPlayers);
    }
    if (card.targetFilter === "ANY_IN_LINEUP" || card.slug === "emergency_sub") {
      return lineupPlayers.length > 0 ? lineupPlayers : marketPlayers;
    }
    return marketPlayers;
  }

  function handleSelectInstance(card: FantasyCardDefinition, instances: FantasyUserCardDTO[]) {
    const availableInstance = instances.find((i) => i.status === "OWNED");
    if (!availableInstance) return;

    const eligible = getEligiblePlayers(card);
    setSelectedToUse({ card, instance: availableInstance });
    setTargetPlayerId(eligible[0]?.id || "");
    setTargetPlayer2Id(eligible[1]?.id || (eligible.length > 1 ? eligible[1]?.id : eligible[0]?.id) || "");
    setTargetPrediction("TOP_SCORER");
  }

  function handleConfirmActivation() {
    if (!selectedToUse || !roundId) return;
    setError(null);

    startTransition(async () => {
      try {
        const res = await activateCardForRound({
          roundId,
          userCardId: selectedToUse.instance.id,
          targetPlayerId: selectedToUse.card.requiresTarget === "SINGLE_PLAYER" || selectedToUse.card.requiresTarget === "DUO_PLAYERS" ? targetPlayerId : undefined,
          targetPlayer2Id: selectedToUse.card.requiresTarget === "DUO_PLAYERS" ? targetPlayer2Id : undefined,
          targetPrediction: selectedToUse.card.requiresTarget === "PREDICTION_TYPE" ? targetPrediction : undefined,
        });

        if (res.success) {
          invalidateFantasyInventory();
          onCardActivated?.();
          onClose();
        } else {
          setError(res.error || "Não foi possível ativar a carta.");
        }
      } catch (err: any) {
        setError(err.message || "Erro de conexão ao ativar carta.");
      }
    });
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md animate-fade-in touch-none overscroll-none"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Inventário de Cartas"
    >
      <div
        className="relative flex w-full max-w-xl max-h-[88vh] flex-col overflow-hidden rounded-[2.5rem] border border-accent/40 bg-[#06160d] shadow-[0_0_60px_rgba(0,0,0,0.95)] animate-fade-in-up my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 p-5 sm:p-6 bg-surface/50">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent/20 text-accent text-xl">
              🎒
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black uppercase text-foreground">
                  {showCatalog ? "Catálogo de Cartas" : "Minhas Cartas Especiais"}
                </h2>
                <span className="rounded-full bg-accent/20 text-accent px-2 py-0.5 text-[8px] font-black uppercase">
                  {showCatalog
                    ? `${FANTASY_CARDS_CATALOG.filter((card) => card.enabled).length} ativas`
                    : `${inventoryData?.availableCount || 0} disponíveis`}
                </span>
              </div>
              <p className="text-xs text-muted">
                {showCatalog
                  ? "Conheça todas as cartas e regras disponíveis no jogo"
                  : "Gerencie suas cartas e selecione 1 para ativar na rodada atual"}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setShowCatalog((current) => !current);
                setSelectedToUse(null);
              }}
              className={`flex h-9 w-9 items-center justify-center rounded-full border text-base font-black transition-colors ${
                showCatalog
                  ? "border-accent bg-accent text-background"
                  : "border-accent/50 bg-accent/10 text-accent hover:bg-accent/20"
              }`}
              aria-label={showCatalog ? "Voltar ao meu inventário" : "Ver todas as cartas do jogo"}
              title={showCatalog ? "Voltar ao inventário" : "Conheça todas as cartas"}
            >
              {showCatalog ? "←" : "!"}
            </button>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Chips de Filtro por Raridade */}
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto p-4 border-b border-white/5 bg-black/20 text-[9px] font-black uppercase tracking-wider">
          {[
            { id: "ALL", label: "Todas" },
            { id: "COMMON", label: "⚪ Comuns" },
            { id: "RARE", label: "🔵 Raras" },
            { id: "EPIC", label: "🟣 Épicas" },
            { id: "LEGENDARY", label: "👑 Lendárias" },
          ].map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setRarityFilter(chip.id)}
              className={`shrink-0 rounded-xl px-3 py-1.5 transition-colors border ${
                rarityFilter === chip.id
                  ? "border-accent bg-accent text-background"
                  : "border-white/10 bg-surface/60 text-muted hover:text-foreground"
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Lista de Cartas / Seleção de Alvo */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 touch-auto overscroll-contain">
          {showCatalog ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {catalogCards.map((card) => {
                const rarityInfo = RARITY_CONFIG[card.rarity];
                const artUrl = getCardArtUrl(card.slug);

                return (
                  <article
                    key={card.slug}
                    className={`[content-visibility:auto] [contain-intrinsic-size:280px] overflow-hidden rounded-2xl border ${rarityInfo.border} ${rarityInfo.bg} ${
                      card.enabled ? "opacity-100" : "opacity-60"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setPreviewCard(card)}
                      className="group relative block aspect-[2/3] w-full overflow-hidden bg-black/40"
                      aria-label={`Ampliar carta ${card.name}`}
                    >
                      {artUrl ? (
                        <Image
                          src={artUrl}
                          alt={card.name}
                          fill
                          sizes="(max-width: 640px) 45vw, 180px"
                          loading="lazy"
                          className="object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                        />
                      ) : (
                        <span className="flex h-full items-center justify-center text-5xl">{card.icon}</span>
                      )}
                      <span className="absolute bottom-2 right-2 rounded-full bg-black/80 px-2 py-1 text-[9px] font-black uppercase text-white">
                        Ampliar
                      </span>
                    </button>
                    <div className="space-y-1.5 p-3">
                      <div className="flex items-start justify-between gap-1">
                        <h3 className={`text-xs font-black uppercase ${rarityInfo.text}`}>{card.name}</h3>
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[7px] font-black uppercase ${rarityInfo.badgeBg}`}>
                          {rarityInfo.label}
                        </span>
                      </div>
                      <p className="text-[10px] leading-relaxed text-muted">{card.description}</p>
                      <p className={`text-[9px] font-black uppercase ${card.enabled ? "text-accent" : "text-warning"}`}>
                        {card.enabled ? "Disponível no jogo" : "Em desenvolvimento"}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : loading ? (
            <div className="py-12 text-center text-sm font-bold text-muted animate-pulse">
              Carregando inventário...
            </div>
          ) : selectedToUse ? (
            /* CONFIGURAÇÃO DE ALVO E ATIVAÇÃO */
            <div className="rounded-3xl border border-accent/40 bg-surface/80 p-5 space-y-4">
              <div className="flex items-center gap-3.5">
                {getCardArtUrl(selectedToUse.card.slug) ? (
                  <button
                    type="button"
                    onClick={() => setPreviewCard(selectedToUse.card)}
                    className="relative h-20 w-14 shrink-0 overflow-hidden rounded-xl border border-white/20 shadow-lg"
                    aria-label={`Ampliar carta ${selectedToUse.card.name}`}
                  >
                    <Image
                      src={getCardArtUrl(selectedToUse.card.slug)!}
                      alt={selectedToUse.card.name}
                      fill
                      sizes="60px"
                      className="object-cover"
                    />
                  </button>
                ) : (
                  <span className="text-3xl">{selectedToUse.card.icon}</span>
                )}
                <div>
                  <h3 className="font-athletic text-lg font-black uppercase italic text-white">
                    Ativar {selectedToUse.card.name}
                  </h3>
                  <p className="text-xs text-muted">{selectedToUse.card.description}</p>
                </div>
              </div>

              {selectedToUse.card.slug === "bargain" && (
                <div className="rounded-2xl border border-warning/40 bg-warning/10 px-3.5 py-3 text-xs leading-relaxed text-warning">
                  <strong>Use antes de escalar.</strong> Escolha o atleta agora; depois ele precisa entrar na sua escalação para o desconto valer.
                </div>
              )}

              {/* Seletor de Jogador Único */}
              {selectedToUse.card.requiresTarget === "SINGLE_PLAYER" && (() => {
                const eligible = getEligiblePlayers(selectedToUse.card);
                const isVice = selectedToUse.card.slug === "vice_captain";
                const isBargain = selectedToUse.card.slug === "bargain";
                const isAllIn = selectedToUse.card.slug === "all_in";

                if (isVice && eligible.length === 0) {
                  return (
                    <div className="rounded-2xl border border-warning/40 bg-warning/10 p-3.5 text-center text-xs text-warning space-y-1">
                      <p className="font-bold">⚠️ Nenhum jogador escalado no time elegível.</p>
                      <p className="text-[11px] text-muted">
                        Escale seus atletas no campinho e defina seu Capitão primeiro para poder nomear o Vice-Capitão.
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted block">
                      {isVice
                        ? "Escolha quem será o Vice-Capitão do seu time (apenas atletas escalados):"
                        : isBargain
                          ? "Escolha o atleta do mercado antes de montar sua escalação:"
                          : isAllIn
                            ? "Escolha qualquer atleta do mercado:"
                            : "Escolha o jogador alvo desta carta:"}
                    </label>
                    <select
                      value={targetPlayerId}
                      onChange={(e) => setTargetPlayerId(e.target.value)}
                      className="h-11 w-full rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground"
                    >
                      {eligible.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (C$ {p.price.toFixed(2)})
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })()}

              {/* Seletor de Dupla de Jogadores */}
              {selectedToUse.card.requiresTarget === "DUO_PLAYERS" && (() => {
                const eligible = getEligiblePlayers(selectedToUse.card);
                const isDoublePrediction = selectedToUse.card.slug === "double_prediction";
                if (eligible.length < 2) {
                  return (
                    <div className="rounded-2xl border border-warning/40 bg-warning/10 p-3.5 text-center text-xs text-warning space-y-1">
                      <p className="font-bold">⚠️ Menos de 2 jogadores elegíveis.</p>
                      <p className="text-[11px] text-muted">
                        {isDoublePrediction
                          ? "É preciso haver ao menos 2 jogadores disponíveis no mercado para ativar o Palpite Duplo."
                          : "Escale pelo menos 2 atletas no seu campinho para poder ativar a Dobradinha."}
                      </p>
                    </div>
                  );
                }

                const isSamePlayer = targetPlayerId && targetPlayer2Id && targetPlayerId === targetPlayer2Id;

                return (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-muted">
                      {isDoublePrediction
                        ? "Escolha dois jogadores do mercado:"
                        : "Escolha 2 atletas do seu time escalado para a Dobradinha:"}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted block">
                          {isDoublePrediction ? "Quem fará 2 gols:" : "Jogador 1:"}
                        </label>
                        <select
                          value={targetPlayerId}
                          onChange={(e) => setTargetPlayerId(e.target.value)}
                          className="h-10 w-full rounded-xl border border-border bg-background px-2 text-xs font-bold text-foreground"
                        >
                          {eligible.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} (C$ {p.price.toFixed(2)})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted block">
                          {isDoublePrediction ? "Quem dará 2 assistências:" : "Jogador 2:"}
                        </label>
                        <select
                          value={targetPlayer2Id}
                          onChange={(e) => setTargetPlayer2Id(e.target.value)}
                          className="h-10 w-full rounded-xl border border-border bg-background px-2 text-xs font-bold text-foreground"
                        >
                          {eligible.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} (C$ {p.price.toFixed(2)})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {isSamePlayer && (
                      <p className="text-[11px] text-danger font-bold">
                        ⚠️ Escolha 2 jogadores diferentes.
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Seletor de Tipo de Palpite */}
              {selectedToUse.card.requiresTarget === "PREDICTION_TYPE" && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted block">
                    Qual palpite deseja dobrar?
                  </label>
                  <select
                    value={targetPrediction}
                    onChange={(e) => setTargetPrediction(e.target.value as any)}
                    className="h-11 w-full rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground"
                  >
                    <option value="TOP_SCORER">⚽ Artilheiro da Rodada</option>
                    <option value="TOP_ASSIST">🍽️ Garçom da Rodada</option>
                    <option value="CHALLENGE">🎯 Desafio da Rodada</option>
                  </select>
                </div>
              )}

              {error && <p className="text-xs text-danger font-bold">{error}</p>}

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedToUse(null)}
                  disabled={pending}
                  className="flex-1 rounded-2xl border border-white/10 py-3 text-xs font-bold text-muted hover:text-white"
                >
                  Voltar
                </button>

                <button
                  type="button"
                  onClick={handleConfirmActivation}
                  disabled={
                    pending ||
                    (selectedToUse.card.requiresTarget === "SINGLE_PLAYER" && !targetPlayerId) ||
                    (selectedToUse.card.slug === "vice_captain" && getEligiblePlayers(selectedToUse.card).length === 0) ||
                    (selectedToUse.card.requiresTarget === "DUO_PLAYERS" && (
                      getEligiblePlayers(selectedToUse.card).length < 2 ||
                      !targetPlayerId ||
                      !targetPlayer2Id ||
                      targetPlayerId === targetPlayer2Id
                    ))
                  }
                  className="flex-2 flex items-center justify-center gap-1.5 rounded-2xl bg-accent py-3 text-xs font-black uppercase text-background shadow-[0_0_20px_rgba(204,255,0,0.3)] hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {pending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Ativando...</span>
                    </>
                  ) : (
                    <span>Confirmar Ativação</span>
                  )}
                </button>
              </div>
            </div>
          ) : groupsList.length === 0 ? (
            <div className="py-12 text-center text-sm font-bold text-muted space-y-2">
              <span className="text-3xl block">🃏</span>
              <p>Você ainda não possui cartas desta categoria.</p>
              <p className="text-xs font-normal">Participe das rodadas oficiais do Cartola para ganhar pacotes!</p>
            </div>
          ) : (
            groupsList.map((group) => {
              const { card, count, instances } = group;
              const rarityInfo = RARITY_CONFIG[card.rarity];
              const available = count > 0;

              return (
                <div
                  key={card.slug}
                  className={`flex items-center justify-between gap-3 rounded-2xl border ${rarityInfo.border} ${rarityInfo.bg} p-3.5 sm:p-4 transition-all ${
                    available ? "opacity-100" : "opacity-50"
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    {getCardArtUrl(card.slug) ? (
                      <button
                        type="button"
                        onClick={() => setPreviewCard(card)}
                        className="relative h-16 w-11 shrink-0 overflow-hidden rounded-xl border border-white/20 shadow-md"
                        aria-label={`Ampliar carta ${card.name}`}
                      >
                        <Image
                          src={getCardArtUrl(card.slug)!}
                          alt={card.name}
                          fill
                          sizes="50px"
                          loading="lazy"
                          className="object-cover"
                        />
                      </button>
                    ) : (
                      <span className="text-3xl shrink-0">{card.icon}</span>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className={`truncate text-sm font-black uppercase italic ${rarityInfo.text}`}>
                          {card.name}
                        </h3>
                        <span className="rounded-full bg-white/10 px-1.5 py-0.2 text-[8px] font-black text-white">
                          ×{count}
                        </span>
                        <span className={`rounded px-1.5 py-0.2 text-[7px] font-black uppercase ${rarityInfo.badgeBg}`}>
                          {rarityInfo.label}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted leading-tight line-clamp-2">
                        {card.description}
                      </p>
                    </div>
                  </div>

                  {roundId && isMarketOpen && (
                    <button
                      type="button"
                      onClick={() => handleSelectInstance(card, instances)}
                      disabled={!available}
                      className={`shrink-0 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-transform active:scale-95 ${
                        available
                          ? "bg-accent text-background hover:brightness-110 shadow-sm"
                          : "bg-white/5 text-muted cursor-not-allowed opacity-50"
                      }`}
                    >
                      {available ? "Usar" : "Esgotada"}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {previewCard && (
          <div
            className="fixed inset-0 z-[100001] flex items-center justify-center bg-black/95 p-4 backdrop-blur-lg"
            onClick={() => setPreviewCard(null)}
            role="dialog"
            aria-modal="true"
            aria-label={`Carta ${previewCard.name} ampliada`}
          >
            <button
              type="button"
              onClick={() => setPreviewCard(null)}
              className="absolute right-5 top-5 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/70 text-white"
              aria-label="Fechar carta ampliada"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="relative h-[82dvh] w-full max-w-md" onClick={(event) => event.stopPropagation()}>
              {getCardArtUrl(previewCard.slug) ? (
                <Image
                  src={getCardArtUrl(previewCard.slug)!}
                  alt={previewCard.name}
                  fill
                  priority
                  sizes="(max-width: 640px) 92vw, 430px"
                  className="object-contain drop-shadow-[0_0_35px_rgba(0,0,0,0.9)]"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-4 rounded-3xl border border-white/20 bg-surface p-6 text-center">
                  <span className="text-7xl">{previewCard.icon}</span>
                  <h3 className="text-2xl font-black uppercase text-white">{previewCard.name}</h3>
                  <p className="text-sm text-muted">{previewCard.description}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
