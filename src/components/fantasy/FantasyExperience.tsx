"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Cards,
  CheckCircle2,
  Clock,
  Crown,
  Eye,
  HelpCircle,
  History,
  Loader2,
  Lock,
  Search,
  Shirt,
  ShoppingCart,
  Sparkles,
  Target,
  TrendingDown,
  Trophy,
  X,
} from "@/components/icons";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { formatFantasyMoney, type FantasySettings } from "@/lib/fantasy/config";
import { CHALLENGE_LABELS, fantasyChallengeOffer, type FantasyChallengeType } from "@/lib/fantasy/challenges";
import {
  saveFantasyLineup,
  type FantasyDashboardInsights,
  type FantasyMarketPlayer,
  type FantasyRadarData,
} from "@/lib/actions/fantasy";
import { supabase } from "@/lib/supabase";
import { useDialogViewport } from "@/lib/useDialogViewport";
import { FantasyRadarCarousel } from "./FantasyRadarCarousel";
import { FantasyPackClaimBanner } from "./cards/FantasyPackClaimBanner";
import { FantasyActiveCardSlot } from "./cards/FantasyActiveCardSlot";
import type { FantasyActiveCardDTO, FantasyPackDTO } from "@/lib/actions/fantasy-cards";

const FantasyTutorialModal = dynamic(
  () => import("./FantasyTutorialModal").then((mod) => mod.FantasyTutorialModal),
  { ssr: false },
);
const FantasyPlayerDrawer = dynamic(
  () => import("./FantasyPlayerDrawer").then((mod) => mod.FantasyPlayerDrawer),
  { ssr: false },
);
const FantasyRevealedLineupsModal = dynamic(
  () => import("./FantasyRevealedLineupsModal").then((mod) => mod.FantasyRevealedLineupsModal),
  { ssr: false },
);
const FantasyInventoryModal = dynamic(
  () => import("./cards/FantasyInventoryModal").then((mod) => mod.FantasyInventoryModal),
  { ssr: false },
);

function preloadInventoryModal() {
  void import("./cards/FantasyInventoryModal").then((mod) => mod.preloadFantasyInventory());
}

type Props = {
  round: {
    id: string;
    number: number;
    date: string;
    start_time: string | null;
    teams?: { id: string; name: string; color: string }[];
  } | null;
  fantasySeasonId: string;
  status: string;
  settings: FantasySettings;
  market: FantasyMarketPlayer[];
  budget: number;
  lineup: any;
  insights: FantasyDashboardInsights;
  radar?: FantasyRadarData;
  account: { totalPoints: number; roundsPlayed: number; bestRoundPoints: number };
  isTest?: boolean;
  lastRound?: {
    number: number;
    date: string;
    playerPoints: number;
    predictionPoints: number;
    totalPoints: number;
  } | null;
  challengeType?: FantasyChallengeType | null;
  activeCard?: FantasyActiveCardDTO | null;
  availablePacks?: FantasyPackDTO[];
  availablePacksCount?: number;
  inventoryCount?: number;
};

const positionLabel: Record<string, string> = {
  defensive: "Defesa",
  midfield: "Meio",
  offensive: "Ataque",
};

export function FantasyExperience({
  round,
  fantasySeasonId,
  status,
  settings,
  market,
  budget,
  lineup,
  insights,
  radar,
  account,
  isTest = false,
  lastRound = null,
  challengeType = null,
  activeCard = null,
  availablePacks = [],
  availablePacksCount = 0,
  inventoryCount = 0,
}: Props) {
  const router = useRouter();
  const initialIds = (lineup?.fantasy_lineup_players || []).map((item: any) => item.player_id as string);
  const [selected, setSelected] = useState<string[]>(initialIds);
  const [captainId, setCaptainId] = useState<string | null>(lineup?.captain_player_id || null);
  const [scorerId, setScorerId] = useState<string | null>(lineup?.top_scorer_player_id || null);
  const [assistId, setAssistId] = useState<string | null>(lineup?.top_assist_player_id || null);
  const [challengeId, setChallengeId] = useState<string | null>(lineup?.challenge_player_id || null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("points");
  const [activeTab, setActiveTab] = useState<"team" | "market">("team");
  const [filterTag, setFilterTag] = useState<string>("ALL");
  const [message, setMessage] = useState("");
  const [showTutorial, setShowTutorial] = useState(false);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [infoModal, setInfoModal] = useState<{ title: string; description: string } | null>(null);
  const [selectedDrawerPlayer, setSelectedDrawerPlayer] = useState<FantasyMarketPlayer | null>(null);
  const [showRevealedLineups, setShowRevealedLineups] = useState(false);
  const [mounted, setMounted] = useState(false);
  const refreshTimerRef = useRef<number | null>(null);

  useDialogViewport(Boolean(infoModal));

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    try {
      const hasSeen = localStorage.getItem("fantasy_tutorial_seen");
      if (!hasSeen) {
        setShowTutorial(true);
        localStorage.setItem("fantasy_tutorial_seen", "true");
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const [savedSignature, setSavedSignature] = useState(() =>
    lineup
      ? JSON.stringify({
          ids: initialIds,
          captain: lineup?.captain_player_id || null,
          scorer: lineup?.top_scorer_player_id || null,
          assist: lineup?.top_assist_player_id || null,
          challenge: lineup?.challenge_player_id || null,
        })
      : ""
  );
  const [pending, startTransition] = useTransition();
  const betweenRounds = status === "between_rounds";
  const open = status === "open" || betweenRounds;
  const isMarketClosed = !open && (status === "in_progress" || status === "finished");

  // V3: Bônus de orçamento temporário da carta Crédito Extra
  const budgetBonus = activeCard?.card?.effectType === "BUDGET_BONUS" ? (activeCard.card.effectConfig?.bonus || 5) : 0;
  const effectiveBudget = budget + budgetBonus;

  // V3: Desconto temporário no preço do jogador da carta Barganha
  const discountedPlayerId = activeCard?.card?.effectType === "PLAYER_DISCOUNT" ? activeCard.targetPlayerId : null;

  const selectedPlayers = selected
    .map((id) => market.find((player) => player.id === id))
    .filter(Boolean) as FantasyMarketPlayer[];

  const cost = selectedPlayers.reduce((sum, player) => {
    const isDiscounted = discountedPlayerId === player.id;
    const price = isDiscounted ? player.price * 0.8 : player.price;
    return sum + price;
  }, 0);

  const remaining = effectiveBudget - cost;

  // Filtros e ordenação no mercado
  const filtered = useMemo(() => {
    return [...market]
      .filter((player) => {
        const matchesQuery = player.name.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"));
        if (!matchesQuery) return false;

        if (filterTag === "ALL") return true;
        if (filterTag === "TREND_UP") return player.trend === "UP";
        if (filterTag === "TREND_DOWN") return player.trend === "DOWN";
        if (filterTag === "HIGH_VALUE") return player.costBenefitScore >= 7.5;
        if (filterTag === "REVELATION") return player.allTags.some((t) => t.type === "REVELATION");
        if (filterTag === "BUDGET") return player.price <= 8.5;
        if (filterTag === "PREMIUM") return player.price >= 16.0;
        return true;
      })
      .sort((a, b) => {
        if (sort === "priceLow") return a.price - b.price;
        if (sort === "priceHigh") return b.price - a.price;
        if (sort === "name") return a.name.localeCompare(b.name, "pt-BR");
        if (sort === "variation") return b.priceChange - a.priceChange;
        if (sort === "lastRound") return b.roundPoints - a.roundPoints;
        if (sort === "form") {
          const sumA = a.recentPointsList.slice(0, 3).reduce((x, y) => x + y, 0);
          const sumB = b.recentPointsList.slice(0, 3).reduce((x, y) => x + y, 0);
          return sumB - sumA;
        }
        if (sort === "costBenefit") return b.costBenefitScore - a.costBenefitScore;
        if (sort === "popularity") return b.popularityPercent - a.popularityPercent;
        return b.totalPoints - a.totalPoints;
      });
  }, [market, query, sort, filterTag]);

  const scheduledAt =
    round?.date && round.start_time ? new Date(`${round.date}T${round.start_time}`).getTime() : null;
  const requestRefresh = useCallback(
    (delay = 300) => {
      if (refreshTimerRef.current) return;
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        router.refresh();
      }, delay);
    },
    [router],
  );

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    };
  }, []);
  const selectedChallengePlayer = market.find((player) => player.id === challengeId) || null;
  const challengeOffer =
    challengeType && selectedChallengePlayer
      ? fantasyChallengeOffer(
          challengeType,
          selectedChallengePlayer.price,
          market.map((player) => player.price),
          settings
        )
      : null;

  const currentSignature = JSON.stringify({
    ids: selected,
    captain: captainId,
    scorer: scorerId,
    assist: assistId,
    challenge: challengeId,
  });
  const complete = selected.length === 5 && Boolean(captainId) && remaining >= 0;
  const isSaved = Boolean(savedSignature && savedSignature === currentSignature);
  const saveState = !open
    ? "Mercado fechado"
    : isSaved
    ? betweenRounds
      ? "Elenco salvo"
      : "Escalação salva"
    : complete
    ? "Pronta para salvar"
    : "Escalação incompleta";

  useEffect(() => {
    if (status !== "in_progress" || !round) return;
    const channel = supabase
      .channel(`fantasy-${round.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "match_events" }, () => requestRefresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "player_round_stats", filter: `round_id=eq.${round.id}` }, () => requestRefresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [requestRefresh, round, status]);

  useEffect(() => {
    const channel = supabase
      .channel(`fantasy-market-players-${round?.id || "analysis"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "players" }, () => requestRefresh(750))
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [requestRefresh, round?.id]);

  function togglePlayer(player: FantasyMarketPlayer) {
    if (!open) {
      setSelectedDrawerPlayer(player);
      return;
    }
    if (selected.includes(player.id)) {
      setSelected((current) => current.filter((id) => id !== player.id));
      if (captainId === player.id) setCaptainId(null);
      return;
    }
    if (selected.length >= 5) return setMessage("Sua escalação já tem cinco jogadores.");
    if (player.price > remaining) return setMessage("Patrimônio insuficiente para comprar este jogador.");
    setSelected((current) => [...current, player.id]);
    setMessage("");
  }

  function save() {
    startTransition(async () => {
      try {
        const result = await saveFantasyLineup({
          fantasySeasonId,
          roundId: betweenRounds ? null : round?.id || null,
          playerIds: selected,
          captainId,
          scorerId,
          assistId,
          challengeId: betweenRounds ? null : challengeId,
        });
        setMessage(
          result.success
            ? betweenRounds
              ? "Elenco permanente salvo para a próxima Ranked!"
              : selected.length === 5 && captainId
              ? "Escalação salva e pronta!"
              : "Rascunho salvo. Complete antes do primeiro jogo."
            : result.error || "Não foi possível salvar."
        );
        if (result.success) setSavedSignature(currentSignature);
      } catch {
        setMessage("A conexão falhou ao salvar. Sua tela foi mantida; tente novamente.");
      }
    });
  }

  return (
    <div className="w-full space-y-5">
      {/* Banner de Modo Teste */}
      {isTest && (
        <div className="overflow-hidden rounded-2xl border border-warning/45 bg-warning/12 p-4 text-center shadow-[0_0_28px_rgba(245,158,11,.08)]">
          <p className="text-[10px] font-black uppercase tracking-[.22em] text-warning">
            Modo teste · amistoso
          </p>
          <p className="mt-1 text-xs font-bold leading-5 text-foreground">
            Esta simulação não altera ranking, preços, patrimônio nem o histórico oficial do Cartola.
          </p>
        </div>
      )}

      {/* Banner de Mercado Permanente */}
      {betweenRounds && (
        <div className="overflow-hidden rounded-2xl border border-accent/35 bg-accent/10 p-4">
          <p className="text-[10px] font-black uppercase tracking-[.22em] text-accent">
            Mercado permanente V2
          </p>
          <p className="mt-1 text-xs font-bold leading-5 text-foreground">
            Compre, venda e escolha seu capitão agora. Seu time será mantido para a próxima Ranked oficial.
          </p>
        </div>
      )}

      {/* V3: BANNER DE PACOTES DISPONÍVEIS */}
      {availablePacks && availablePacks.length > 0 && (
        <FantasyPackClaimBanner
          packs={availablePacks}
          onPackClaimed={() => requestRefresh(0)}
        />
      )}

      {/* Painel principal */}
      <header className="relative overflow-hidden rounded-[1.75rem] border border-accent/30 bg-[radial-gradient(circle_at_88%_6%,rgba(204,255,0,.22),transparent_31%),linear-gradient(145deg,rgba(10,57,31,.96),rgba(3,20,12,.98)_58%)] shadow-[0_22px_60px_rgba(0,0,0,.3)]">
        <div className="pointer-events-none absolute inset-0 opacity-[.08]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.8) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.8) 1px,transparent 1px)", backgroundSize: "32px 32px" }} />
        <div className="relative p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[.26em] text-accent">Fantasy da Pelada</p>
              <h1 className="mt-1 font-athletic text-[2rem] font-black uppercase italic leading-none text-foreground">Cartola</h1>
              <p className="mt-2 max-w-[250px] text-xs leading-5 text-muted">
                {betweenRounds
                  ? "Prepare seu elenco com base em valorização, tendências e custo-benefício"
                  : `Ranked ${round?.number || ""} · escale cinco craques`}
              </p>
            </div>
            <span
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-[9px] font-black uppercase tracking-wider ${
                isTest
                  ? "border-warning/30 bg-warning/15 text-warning"
                  : open
                  ? "border-accent/35 bg-accent/15 text-accent"
                  : status === "in_progress"
                  ? "border-warning/30 bg-warning/15 text-warning"
                  : "border-white/10 bg-black/20 text-muted"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${open ? "bg-accent shadow-[0_0_8px_rgba(204,255,0,.8)]" : "bg-current"}`} />
              {isTest
                ? `Teste · ${open ? "aberto" : status === "in_progress" ? "em jogo" : "finalizado"}`
                : betweenRounds
                ? "Compras abertas"
                : open
                ? "Mercado aberto"
                : status === "in_progress"
                ? "Em andamento"
                : "Finalizado"}
            </span>
          </div>

          <div className="mt-5 grid grid-cols-3 divide-x divide-white/10 rounded-2xl border border-white/10 bg-black/20 px-1 py-3 backdrop-blur-sm">
            <Metric label="Patrimônio" value={formatFantasyMoney(budget, settings.currencyName)} />
            <Metric
              label={betweenRounds ? "Pontos" : "Escalação"}
              value={betweenRounds ? account.totalPoints.toFixed(1) : formatFantasyMoney(cost, settings.currencyName)}
            />
            <Metric
              label={betweenRounds ? "Melhor rodada" : "Restante"}
              value={betweenRounds ? `${account.bestRoundPoints.toFixed(1)} pts` : formatFantasyMoney(remaining, settings.currencyName)}
              accent={betweenRounds || remaining >= 0}
            />
          </div>
        </div>

        {!betweenRounds && round && (
          <div className={`relative flex items-center gap-3 border-t px-5 py-3.5 ${open ? "border-accent/20 bg-accent/[.08]" : "border-white/10 bg-black/20"}`}>
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${open ? "bg-accent text-background" : "bg-white/5 text-muted"}`}>
              {open ? <Clock className="h-4.5 w-4.5" /> : <Lock className="h-4.5 w-4.5" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[8px] font-black uppercase tracking-[.2em] text-muted">Janela de escalação</p>
              <p className="mt-0.5 text-xs font-black text-foreground">
                {open && scheduledAt ? <MarketCountdown scheduledAt={scheduledAt} /> : open ? "Fecha no início da primeira partida" : "Escalações bloqueadas"}
              </p>
            </div>
          </div>
        )}
      </header>

      {/* Resumo da Última Rodada */}
      {lastRound && !isTest && (
        <section className="overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[.18em] text-muted">
                Última rodada
              </p>
              <p className="mt-0.5 text-sm font-black text-foreground">
                Ranked {String(lastRound.number).padStart(2, "0")}
              </p>
            </div>
            <strong className="text-2xl font-black text-accent">
              {lastRound.totalPoints.toFixed(1)} pts
            </strong>
          </div>
          <div className="grid grid-cols-2 gap-px bg-border">
            <Metric label="Jogadores" value={`${lastRound.playerPoints.toFixed(1)} pts`} />
            <Metric label="Palpites" value={`${lastRound.predictionPoints.toFixed(1)} pts`} />
          </div>
        </section>
      )}

      {/* Botão de Revelação de Escalações Pós-Fechamento */}
      {isMarketClosed && (
        <button
          type="button"
          onClick={() => setShowRevealedLineups(true)}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-gradient-to-r from-accent/20 via-surface to-accent/10 p-4 text-left shadow-lg transition-all duration-300 hover:scale-[1.01] active:scale-[0.99]"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-background shadow">
              <Eye className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black uppercase text-foreground">
                  Escalações reveladas
                </span>
                <span className="rounded-full bg-success/20 text-success px-2 py-0.5 text-[8px] font-black uppercase">
                  Ao Vivo
                </span>
              </div>
              <p className="text-[10px] text-muted">
                O mercado fechou! Toque para ver os 5 jogadores, capitão e palpites de todos os rivais.
              </p>
            </div>
          </div>
          <span className="rounded-xl bg-accent px-3 py-1.5 text-xs font-black text-background shrink-0">
            Ver Times →
          </span>
        </button>
      )}

      {/* Central do Cartola */}
      <nav aria-label="Central do Cartola" className="grid grid-cols-4 gap-2">
        <Link
          className="group flex min-w-0 flex-col items-center gap-2 rounded-2xl border border-border bg-surface/80 px-1.5 py-3 text-center transition-colors hover:border-accent/40 hover:bg-surface-hover"
          href="/cartola/ranking"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent group-hover:bg-accent group-hover:text-background"><Trophy className="h-4.5 w-4.5" /></span>
          <span className="truncate text-[10px] font-black text-foreground">Ranking</span>
        </Link>
        <Link
          className="group flex min-w-0 flex-col items-center gap-2 rounded-2xl border border-border bg-surface/80 px-1.5 py-3 text-center transition-colors hover:border-accent/40 hover:bg-surface-hover"
          href="/cartola/historico"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent group-hover:bg-accent group-hover:text-background"><History className="h-4.5 w-4.5" /></span>
          <span className="truncate text-[10px] font-black text-foreground">Histórico</span>
        </Link>
        <button
          type="button"
          onClick={() => setShowInventoryModal(true)}
          onPointerEnter={preloadInventoryModal}
          onFocus={preloadInventoryModal}
          onTouchStart={preloadInventoryModal}
          className="group flex min-w-0 flex-col items-center gap-2 rounded-2xl border border-accent/30 bg-accent/[.08] px-1.5 py-3 text-center transition-colors hover:bg-accent/15"
        >
          <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-background"><Cards className="h-4.5 w-4.5" />{inventoryCount > 0 && <span className="absolute -right-1.5 -top-1.5 min-w-4 rounded-full border border-background bg-foreground px-1 text-[8px] font-black leading-4 text-background">{inventoryCount}</span>}</span>
          <span className="truncate text-[10px] font-black text-accent">Cartas</span>
        </button>
        <button
          type="button"
          onClick={() => setShowTutorial(true)}
          className="group flex min-w-0 flex-col items-center gap-2 rounded-2xl border border-border bg-surface/80 px-1.5 py-3 text-center transition-colors hover:border-accent/40 hover:bg-surface-hover"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-muted group-hover:bg-accent/10 group-hover:text-accent"><HelpCircle className="h-4.5 w-4.5" /></span>
          <span className="truncate text-[10px] font-black text-foreground">Como jogar</span>
        </button>
      </nav>

      {/* SELETOR DE ABAS PRINCIPAIS (MEU TIME × MERCADO) */}
      <div className="sticky top-[4.25rem] z-30 rounded-2xl border border-border bg-[#05100B]/95 p-1.5 backdrop-blur-xl shadow-[0_12px_35px_rgba(0,0,0,.35)]">
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab("team")}
            className={`relative flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs font-black uppercase tracking-wider transition-all duration-200 ${
              activeTab === "team"
                ? "bg-accent text-background shadow-[0_0_15px_rgba(204,255,0,0.35)]"
                : "bg-surface/70 text-muted hover:text-foreground hover:bg-surface"
            }`}
          >
            <Shirt className="h-4 w-4" />
            <span>Meu time</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[9px] font-black leading-none ${
                activeTab === "team"
                  ? "bg-background/25 text-background"
                  : selected.length === 5
                  ? "bg-success/20 text-success"
                  : "bg-white/10 text-muted"
              }`}
            >
              {selected.length}/5
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("market")}
            className={`relative flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs font-black uppercase tracking-wider transition-all duration-200 ${
              activeTab === "market"
                ? "bg-accent text-background shadow-[0_0_15px_rgba(204,255,0,0.35)]"
                : "bg-surface/70 text-muted hover:text-foreground hover:bg-surface"
            }`}
          >
            <ShoppingCart className="h-4 w-4" />
            <span>Mercado</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[9px] font-black leading-none ${
                activeTab === "market"
                  ? "bg-background/25 text-background"
                  : "bg-white/10 text-muted"
              }`}
            >
              {market.length}
            </span>
          </button>
        </div>
      </div>

      {/* CONTEÚDO PRINCIPAL: MEU TIME OU MERCADO */}
      <div className="w-full">
        {/* ABA: MEU TIME */}
        {activeTab === "team" && (
          <section className="space-y-4 w-full animate-fade-in">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-black uppercase text-foreground">
                  {betweenRounds ? "Meu elenco" : "Meu time"}
                </h2>
                <p className="text-[10px] text-muted">
                  {open ? "Toque na coroa para escolher o capitão (2x)" : "Escalação somente para consulta"}
                </p>
                <p
                  className={`mt-1 text-[9px] font-black uppercase ${
                    saveState.includes("salva") || saveState.includes("Pronta")
                      ? "text-accent"
                      : "text-warning"
                  }`}
                >
                  {saveState}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("market")}
                className="rounded-xl border border-accent/40 bg-accent/15 px-3 py-1.5 text-xs font-black text-accent hover:bg-accent/25 transition-colors shadow-sm"
              >
                + Mercado ({market.length})
              </button>
            </div>

            {/* CAMPO DE FUTEBOL REALISTA */}
            <div className="relative min-h-[480px] w-full max-w-full overflow-hidden rounded-[2.5rem] border-2 border-emerald-400/35 bg-[#083b1f] p-3 sm:p-4 shadow-[0_20px_50px_rgba(0,0,0,0.7),inset_0_0_50px_rgba(0,0,0,0.6)]">
              <div
                className="pointer-events-none absolute inset-0 opacity-40"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 55px, transparent 55px, transparent 110px), radial-gradient(circle at 50% 30%, rgba(204,255,0,0.12), transparent 70%)",
                }}
              />

              <div className="pointer-events-none absolute inset-3 sm:inset-4 rounded-[2rem] border-2 border-white/40">
                <div className="absolute inset-x-0 top-0 h-0.5 border-t-2 border-white/50" />
                <div className="absolute -top-0.5 left-1/2 h-16 w-32 -translate-x-1/2 rounded-b-full border-b-2 border-x-2 border-white/40" />
                <div className="absolute top-0 left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/70 shadow-sm" />
                <div className="absolute bottom-28 left-1/2 h-12 w-28 -translate-x-1/2 rounded-t-full border-t-2 border-x-2 border-white/40" />
                <div className="absolute bottom-0 left-1/2 h-28 w-64 -translate-x-1/2 border-t-2 border-x-2 border-white/45 bg-white/[0.015]" />
                <div className="absolute bottom-18 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-white/80 shadow-sm" />
                <div className="absolute bottom-0 left-1/2 h-12 w-32 -translate-x-1/2 border-t-2 border-x-2 border-white/45 bg-white/[0.02]" />
                <div className="absolute -bottom-1 left-1/2 h-2 w-20 -translate-x-1/2 border-t-2 border-x-2 border-white/60 bg-white/10 rounded-t-xs" />
              </div>

              <div className="relative z-10 flex min-h-[448px] flex-col justify-between py-2">
                {/* Ataque */}
                <div>
                  <span className="block text-center font-athletic text-[8px] font-black uppercase italic tracking-[0.2em] text-emerald-200/50 mb-1">
                    Ataque
                  </span>
                  <div className="grid grid-cols-2 gap-2 px-1 sm:px-4">
                    {[0, 1].map((slot) => {
                      const player = selectedPlayers[slot];
                      return player ? (
                        <div key={player.id} className="relative mx-auto flex w-full max-w-32 flex-col items-center">
                          <button
                            type="button"
                            disabled={!open}
                            onClick={() => setCaptainId(player.id)}
                            className={`absolute -right-1 -top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full border shadow-md transition-transform active:scale-90 ${
                              captainId === player.id
                                ? "border-accent bg-accent text-background scale-110 shadow-[0_0_12px_rgba(204,255,0,0.6)]"
                                : "border-white/20 bg-background text-muted hover:text-white"
                            }`}
                            aria-label={`Escolher ${player.name} como capitão`}
                            title="Tornar Capitão (Pontos 2x)"
                          >
                            <Crown className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedDrawerPlayer(player)}
                            className="flex flex-col items-center group"
                          >
                            <PlayerAvatar
                              name={player.name}
                              avatarUrl={player.avatarUrl}
                              clickable={false}
                              className={`h-14 w-14 rounded-full border-2 bg-background text-sm font-black shadow-lg transition-transform group-active:scale-95 ${
                                captainId === player.id
                                  ? "border-accent ring-2 ring-accent/50"
                                  : "border-emerald-300"
                              }`}
                            />
                            <span className="mt-1 max-w-32 truncate rounded-lg bg-black/85 px-2 py-0.5 text-center text-[10px] font-black leading-tight text-white shadow-sm">
                              {player.name}
                            </span>
                            <span className="mt-0.5 text-[9px] font-black text-accent drop-shadow">
                              {status === "in_progress"
                                ? `${(
                                    player.roundPoints *
                                    (captainId === player.id ? settings.captainMultiplier : 1)
                                  ).toFixed(1)} pts`
                                : formatFantasyMoney(player.price, settings.currencyName)}
                            </span>
                            {betweenRounds && (
                              <span className="text-[8px] font-bold text-white/60">
                                Última: {player.roundPoints.toFixed(1)} pts
                              </span>
                            )}
                          </button>
                        </div>
                      ) : (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => {
                            setFilterTag("ALL");
                            setActiveTab("market");
                          }}
                          className="mx-auto flex h-18 w-24 flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-300/40 bg-black/25 text-center shadow-inner transition hover:border-accent hover:bg-black/40 active:scale-95"
                        >
                          <span className="text-[10px] font-bold text-accent">+ Vaga {slot + 1}</span>
                          <span className="text-[8px] text-emerald-200/60 font-semibold uppercase">Atacante</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Meio-Campo */}
                <div>
                  <span className="block text-center font-athletic text-[8px] font-black uppercase italic tracking-[0.2em] text-emerald-200/50 mb-1">
                    Meio-Campo & Alas
                  </span>
                  <div className="grid grid-cols-2 gap-2 px-1 sm:px-4">
                    {[2, 3].map((slot) => {
                      const player = selectedPlayers[slot];
                      return player ? (
                        <div key={player.id} className="relative mx-auto flex w-full max-w-32 flex-col items-center">
                          <button
                            type="button"
                            disabled={!open}
                            onClick={() => setCaptainId(player.id)}
                            className={`absolute -right-1 -top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full border shadow-md transition-transform active:scale-90 ${
                              captainId === player.id
                                ? "border-accent bg-accent text-background scale-110 shadow-[0_0_12px_rgba(204,255,0,0.6)]"
                                : "border-white/20 bg-background text-muted hover:text-white"
                            }`}
                            aria-label={`Escolher ${player.name} como capitão`}
                            title="Tornar Capitão (Pontos 2x)"
                          >
                            <Crown className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedDrawerPlayer(player)}
                            className="flex flex-col items-center group"
                          >
                            <PlayerAvatar
                              name={player.name}
                              avatarUrl={player.avatarUrl}
                              clickable={false}
                              className={`h-14 w-14 rounded-full border-2 bg-background text-sm font-black shadow-lg transition-transform group-active:scale-95 ${
                                captainId === player.id
                                  ? "border-accent ring-2 ring-accent/50"
                                  : "border-emerald-300"
                              }`}
                            />
                            <span className="mt-1 max-w-32 truncate rounded-lg bg-black/85 px-2 py-0.5 text-center text-[10px] font-black leading-tight text-white shadow-sm">
                              {player.name}
                            </span>
                            <span className="mt-0.5 text-[9px] font-black text-accent drop-shadow">
                              {status === "in_progress"
                                ? `${(
                                    player.roundPoints *
                                    (captainId === player.id ? settings.captainMultiplier : 1)
                                  ).toFixed(1)} pts`
                                : formatFantasyMoney(player.price, settings.currencyName)}
                            </span>
                            {betweenRounds && (
                              <span className="text-[8px] font-bold text-white/60">
                                Última: {player.roundPoints.toFixed(1)} pts
                              </span>
                            )}
                          </button>
                        </div>
                      ) : (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => {
                            setFilterTag("ALL");
                            setActiveTab("market");
                          }}
                          className="mx-auto flex h-18 w-24 flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-300/40 bg-black/25 text-center shadow-inner transition hover:border-accent hover:bg-black/40 active:scale-95"
                        >
                          <span className="text-[10px] font-bold text-accent">+ Vaga {slot + 1}</span>
                          <span className="text-[8px] text-emerald-200/60 font-semibold uppercase">Meia/Ala</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Defesa */}
                <div>
                  <span className="block text-center font-athletic text-[8px] font-black uppercase italic tracking-[0.2em] text-emerald-200/50 mb-1">
                    Goleiro & Defesa
                  </span>
                  <div className="flex justify-center">
                    {[4].map((slot) => {
                      const player = selectedPlayers[slot];
                      return player ? (
                        <div key={player.id} className="relative mx-auto flex w-full max-w-32 flex-col items-center">
                          <button
                            type="button"
                            disabled={!open}
                            onClick={() => setCaptainId(player.id)}
                            className={`absolute -right-1 -top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full border shadow-md transition-transform active:scale-90 ${
                              captainId === player.id
                                ? "border-accent bg-accent text-background scale-110 shadow-[0_0_12px_rgba(204,255,0,0.6)]"
                                : "border-white/20 bg-background text-muted hover:text-white"
                            }`}
                            aria-label={`Escolher ${player.name} como capitão`}
                            title="Tornar Capitão (Pontos 2x)"
                          >
                            <Crown className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedDrawerPlayer(player)}
                            className="flex flex-col items-center group"
                          >
                            <PlayerAvatar
                              name={player.name}
                              avatarUrl={player.avatarUrl}
                              clickable={false}
                              className={`h-14 w-14 rounded-full border-2 bg-background text-sm font-black shadow-lg transition-transform group-active:scale-95 ${
                                captainId === player.id
                                  ? "border-accent ring-2 ring-accent/50"
                                  : "border-emerald-300"
                              }`}
                            />
                            <span className="mt-1 max-w-32 truncate rounded-lg bg-black/85 px-2 py-0.5 text-center text-[10px] font-black leading-tight text-white shadow-sm">
                              {player.name}
                            </span>
                            <span className="mt-0.5 text-[9px] font-black text-accent drop-shadow">
                              {status === "in_progress"
                                ? `${(
                                    player.roundPoints *
                                    (captainId === player.id ? settings.captainMultiplier : 1)
                                  ).toFixed(1)} pts`
                                : formatFantasyMoney(player.price, settings.currencyName)}
                            </span>
                            {betweenRounds && (
                              <span className="text-[8px] font-bold text-white/60">
                                Última: {player.roundPoints.toFixed(1)} pts
                              </span>
                            )}
                          </button>
                        </div>
                      ) : (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => {
                            setFilterTag("ALL");
                            setActiveTab("market");
                          }}
                          className="mx-auto flex h-18 w-24 flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-300/40 bg-black/25 text-center shadow-inner transition hover:border-accent hover:bg-black/40 active:scale-95"
                        >
                          <span className="text-[10px] font-bold text-accent">+ Vaga 5</span>
                          <span className="text-[8px] text-emerald-200/60 font-semibold uppercase">
                            Goleiro/Defesa
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* V3: SLOT DE CARTA ESPECIAL ATIVA */}
            {!betweenRounds && round && (
              <FantasyActiveCardSlot
                roundId={round.id}
                activeCard={activeCard}
                isMarketOpen={open}
                marketPlayers={market}
                lineupPlayers={selectedPlayers}
                captainPlayerId={captainId}
                onRefresh={() => requestRefresh(0)}
              />
            )}

            {/* Palpites da Rodada */}
            {!betweenRounds && (
              <section className="glass-card space-y-4 p-4">
                <div>
                  <h2 className="text-sm font-black uppercase text-foreground">Palpites da rodada</h2>
                  <p className="mt-1 text-[10px] text-muted">
                    Palpites vazios valem zero e não invalidam sua escalação.
                  </p>
                </div>

                <Select
                  label={`Artilheiro (+${settings.topScorerPredictionPoints} pts)`}
                  value={scorerId || ""}
                  disabled={!open}
                  onChange={setScorerId}
                  options={market.map((p) => ({ id: p.id, name: p.name }))}
                  onInfoClick={() =>
                    setInfoModal({
                      title: "Palpite: Artilheiro da Rodada",
                      description: `Aposte no jogador que você acredita que fará o maior número de gols nesta rodada. Se ele for o artilheiro, você fatura +${settings.topScorerPredictionPoints} pontos de bônus!`,
                    })
                  }
                />

                <Select
                  label={`Garçom (+${settings.topAssistPredictionPoints} pts)`}
                  value={assistId || ""}
                  disabled={!open}
                  onChange={setAssistId}
                  options={market.map((p) => ({ id: p.id, name: p.name }))}
                  onInfoClick={() =>
                    setInfoModal({
                      title: "Palpite: Garçom da Rodada",
                      description: `Aposte no jogador que dará o maior número de passes para gol. Se ele for o líder de assistências, você fatura +${settings.topAssistPredictionPoints} pontos de bônus!`,
                    })
                  }
                />

                {challengeType && (
                  <div className="rounded-2xl border border-warning/35 bg-gradient-to-br from-warning/15 via-[#1a1405] to-[#0d160e] p-3.5 space-y-2.5 shadow-inner">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-warning/20 text-warning">
                          <Target className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-[.16em] text-warning">
                            Desafio da Rodada
                          </p>
                          <p className="text-xs font-black text-foreground">
                            {CHALLENGE_LABELS[challengeType]}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setInfoModal({
                            title: `Desafio: ${CHALLENGE_LABELS[challengeType]}`,
                            description: challengeOffer
                              ? `Objetivo especial da rodada. Escale o jogador para cumprir a meta "${challengeOffer.description}" e garantir +${challengeOffer.reward} pontos extras!`
                              : "Objetivo especial da rodada. Escale o jogador correto para faturar pontos extras no Cartola!",
                          })
                        }
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-warning/20 text-warning hover:bg-warning/30 transition-colors"
                        aria-label="Informações sobre o desafio da rodada"
                      >
                        <HelpCircle className="h-4 w-4" />
                      </button>
                    </div>
                    <div>
                      <Select
                        label="Escolha o jogador do desafio"
                        value={challengeId || ""}
                        disabled={!open}
                        onChange={setChallengeId}
                        options={market.map((p) => ({ id: p.id, name: p.name }))}
                      />
                    </div>
                    {selectedChallengePlayer && challengeOffer && (
                      <div className="rounded-xl border border-warning/25 bg-black/40 p-2.5 text-[10px] font-bold text-foreground">
                        <p className="text-white">
                          {selectedChallengePlayer.name} ·{" "}
                          <span className="text-accent font-black">{formatFantasyMoney(selectedChallengePlayer.price, settings.currencyName)}</span>
                        </p>
                        <p className="mt-0.5 text-warning font-semibold">
                          {challengeOffer.description} · <span className="font-black text-accent">+{challengeOffer.reward} pts</span>
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {betweenRounds && (
              <p className="rounded-xl border border-border bg-surface p-3 text-center text-[10px] font-bold text-muted">
                Os palpites e o Desafio da Rodada serão liberados quando a próxima Ranked for criada.
              </p>
            )}

            {/* Botão de Salvar */}
            {open && (
              <button
                type="button"
                onClick={save}
                disabled={pending || remaining < 0 || isSaved}
                className={`flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-black uppercase tracking-wider transition-all duration-300 active:scale-[0.99] ${
                  isSaved
                    ? "border border-success/40 bg-success/15 text-success shadow-[0_0_20px_rgba(34,197,94,0.15)] cursor-default"
                    : complete
                    ? "bg-accent text-background shadow-[0_0_25px_rgba(204,255,0,0.25)] hover:brightness-110"
                    : "border border-warning/40 bg-warning text-background shadow-[0_0_20px_rgba(234,179,8,0.2)]"
                } disabled:opacity-80`}
              >
                {pending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : isSaved ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-success" />
                    <span>{betweenRounds ? "Elenco Salvo" : "Escalação Salva"}</span>
                  </>
                ) : betweenRounds ? (
                  "Salvar Elenco para a Próxima Ranked"
                ) : complete ? (
                  "Salvar Escalação"
                ) : (
                  "Salvar Rascunho"
                )}
              </button>
            )}

            {message && (
              <p
                role="status"
                className="rounded-xl border border-border bg-surface p-3 text-center text-xs font-bold text-foreground"
              >
                {message}
              </p>
            )}
          </section>
        )}

        {/* ABA: MERCADO DE JOGADORES */}
        {activeTab === "market" && (
          <aside className="space-y-4 w-full animate-fade-in">
            {/* Barra de Resumo de Orçamento e Acesso Rápido ao Time */}
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-accent/30 bg-gradient-to-r from-accent/15 via-[#06180e] to-surface p-3.5 shadow-md">
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-wider text-muted">
                  {betweenRounds ? "Elenco em Montagem" : "Orçamento da Rodada"}
                </p>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className={`text-xs font-black ${remaining >= 0 ? "text-foreground" : "text-danger"}`}>
                    {formatFantasyMoney(remaining, settings.currencyName)}{" "}
                    <span className="text-[9px] font-bold text-muted">livres</span>
                  </span>
                  <span className="text-[10px] font-bold text-accent">
                    · {selected.length}/5 escalados
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("team")}
                className="shrink-0 rounded-xl bg-accent px-3 py-1.5 text-xs font-black uppercase tracking-tight text-background shadow transition-transform active:scale-95"
              >
                Ver Time ({selected.length}/5) →
              </button>
            </div>

            {/* RADAR CARTOLA V2 (Carrossel Dinâmico de Mercado Vivo) */}
            {radar && (
              <FantasyRadarCarousel
                radar={radar}
                onSelectPlayer={(player) => setSelectedDrawerPlayer(player)}
              />
            )}

            {/* Cabeçalho Responsivo do Mercado */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <h2 className="text-sm font-black uppercase text-foreground">Mercado de Jogadores</h2>
                <p className="text-[10px] text-muted">
                  {isTest
                    ? "Convocados do amistoso · preços fictícios"
                    : open
                    ? "Preços vivos, valorização e histórico"
                    : "Mercado fechado · consulte estatísticas"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-muted shrink-0">Ordenar:</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="w-full sm:w-auto rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-bold text-foreground"
                >
                  <option value="points">Mais pontos</option>
                  <option value="lastRound">Última rodada</option>
                  <option value="variation">Valorização</option>
                  <option value="form">Melhor forma</option>
                  <option value="costBenefit">Custo-benefício</option>
                  <option value="popularity">Mais escalado</option>
                  <option value="priceLow">Menor preço</option>
                  <option value="priceHigh">Maior preço</option>
                  <option value="name">Nome (A-Z)</option>
                </select>
              </div>
            </div>

            {/* Chips de Filtros Rápidos */}
            <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 text-[9px] font-black uppercase tracking-wider">
              {[
                { id: "ALL", label: "Todos" },
                { id: "TREND_UP", label: "🔥 Em Alta" },
                { id: "TREND_DOWN", label: "📉 Em Baixa" },
                { id: "HIGH_VALUE", label: "💎 Custo-Benefício" },
                { id: "REVELATION", label: "🚀 Revelação" },
                { id: "BUDGET", label: "💰 Baratos" },
                { id: "PREMIUM", label: "💸 Premium" },
              ].map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setFilterTag(chip.id)}
                  className={`shrink-0 rounded-xl px-2.5 py-1.5 transition-colors border ${
                    filterTag === chip.id
                      ? "border-accent bg-accent text-background font-black shadow-sm"
                      : "border-white/10 bg-surface/60 text-muted hover:text-foreground"
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Campo de Busca */}
            <label className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3">
              <Search className="h-4 w-4 text-muted shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nome do atleta..."
                className="h-11 w-full bg-transparent text-xs font-bold text-foreground outline-none placeholder:text-muted/60"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="text-muted hover:text-foreground text-xs p-1"
                  aria-label="Limpar busca"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </label>

            {/* Lista de Atletas do Mercado */}
            <div className="space-y-2.5 w-full">
              {filtered.map((player) => {
                const bought = selected.includes(player.id);
                const simulatedRemaining = bought ? remaining + player.price : remaining - player.price;

                return (
                  <div
                    key={player.id}
                    className={`flex flex-col gap-2 rounded-2xl border p-3 text-left transition ${
                      bought
                        ? "border-accent/60 bg-accent/10 shadow-[0_0_15px_rgba(204,255,0,0.06)]"
                        : "border-border bg-surface hover:border-accent/30"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Botão de Perfil / Drawer */}
                      <button
                        type="button"
                        onClick={() => setSelectedDrawerPlayer(player)}
                        className="shrink-0 relative group"
                        title="Ver perfil completo do Cartola"
                      >
                        <PlayerAvatar
                          name={player.name}
                          avatarUrl={player.avatarUrl}
                          clickable={false}
                          className="h-12 w-12 rounded-full border border-border bg-background text-xs font-black text-accent group-hover:border-accent transition-colors"
                        />
                        <span className="absolute -bottom-1 -right-1 text-[10px]">
                          {player.trendIcon}
                        </span>
                      </button>

                      {/* Dados Centrais */}
                      <div
                        className="min-w-0 flex-1 cursor-pointer"
                        onClick={() => setSelectedDrawerPlayer(player)}
                      >
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-xs font-black text-foreground hover:text-accent transition-colors">
                            {player.name}
                          </p>
                          <span className="text-[8px] font-bold text-muted">
                            {player.formIcon} {player.formLabel}
                          </span>
                        </div>

                        {/* Tags Compactas */}
                        {player.compactTags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {player.compactTags.map((t) => (
                              <span
                                key={t.type}
                                className="rounded bg-black/40 px-1.5 py-0.2 text-[7px] font-black uppercase text-accent border border-accent/20"
                              >
                                {t.icon} {t.label}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="mt-1 flex items-center gap-2 text-[9px]">
                          <span className="font-black text-accent">
                            {formatFantasyMoney(player.price, settings.currencyName)}
                          </span>
                          <span
                            className={`font-black ${
                              player.variation >= 0 ? "text-success" : "text-danger"
                            }`}
                          >
                            {player.variation > 0 ? "+" : ""}
                            {(player.variation * 100).toFixed(1)}%
                          </span>
                          {player.popularityPercent > 0 && (
                            <span className="text-muted font-semibold">
                              · {player.popularityPercent}% escalado
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Pontos & Ação */}
                      <div className="text-right shrink-0">
                        <p className="text-sm font-black text-foreground">
                          {player.totalPoints.toFixed(1)}
                        </p>
                        <p className="text-[8px] uppercase text-muted">pontos</p>

                        {open && (
                          <button
                            type="button"
                            onClick={() => togglePlayer(player)}
                            disabled={!bought && player.price > remaining}
                            className={`mt-1.5 rounded-xl px-3 py-1 text-[9px] font-black uppercase transition-transform active:scale-90 ${
                              bought
                                ? "bg-danger/20 text-danger border border-danger/30 hover:bg-danger/30"
                                : player.price > remaining
                                ? "bg-white/5 text-muted cursor-not-allowed opacity-50"
                                : "bg-accent text-background hover:brightness-110 shadow-sm"
                            }`}
                          >
                            {bought ? "Vender" : "Comprar"}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Informação de Saldo Simulado */}
                    {open && (
                      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-1 border-t border-white/5 pt-1.5 text-[9px] text-muted min-w-0">
                        <span className="truncate">
                          {bought
                            ? `Saldo após venda: ${formatFantasyMoney(simulatedRemaining, settings.currencyName)}`
                            : `Saldo após compra: ${formatFantasyMoney(simulatedRemaining, settings.currencyName)}`}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedDrawerPlayer(player)}
                          className="text-accent font-bold hover:underline shrink-0"
                        >
                          Gráfico & histórico →
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </aside>
        )}
      </div>

      {/* DRAWER INTERATIVO DE DETALHES DO JOGADOR */}
      {selectedDrawerPlayer && (
        <FantasyPlayerDrawer
          player={selectedDrawerPlayer}
          settings={settings}
          isOpen={Boolean(selectedDrawerPlayer)}
          onClose={() => setSelectedDrawerPlayer(null)}
          isBought={Boolean(selectedDrawerPlayer && selected.includes(selectedDrawerPlayer.id))}
          isMarketOpen={open}
          onToggleBuy={(p) => togglePlayer(p)}
        />
      )}

      {/* MODAL DE ESCALAÇÕES REVELADAS */}
      {showRevealedLineups && (
        <FantasyRevealedLineupsModal
          roundId={round?.id}
          roundNumber={round?.number}
          isOpen={showRevealedLineups}
          onClose={() => setShowRevealedLineups(false)}
        />
      )}

      {/* V3: MODAL DE INVENTÁRIO */}
      {showInventoryModal && (
        <FantasyInventoryModal
          isOpen={showInventoryModal}
          onClose={() => setShowInventoryModal(false)}
          roundId={round?.id}
          isMarketOpen={open}
          marketPlayers={market}
          lineupPlayers={selectedPlayers}
          captainPlayerId={captainId}
          onCardActivated={() => requestRefresh(0)}
        />
      )}

      {/* MODAL DE TUTORIAL */}
      {showTutorial && <FantasyTutorialModal isOpen={showTutorial} onClose={() => setShowTutorial(false)} />}

      {/* POPUP BÁSICO DE AJUDA DOS PALPITES / DESAFIO */}
      {mounted &&
        infoModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="mobile-dialog-backdrop z-[99999] bg-black/90 backdrop-blur-md animate-fade-in"
            onClick={() => setInfoModal(null)}
            role="dialog"
            aria-modal="true"
            aria-label={infoModal.title}
          >
            <div
              className="relative flex w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-accent/40 bg-[#07150d] p-6 shadow-[0_0_60px_rgba(0,0,0,0.95)] animate-fade-in-up my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setInfoModal(null)}
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
                  <HelpCircle className="h-5 w-5" />
                </div>
                <h3 className="font-athletic text-base font-black uppercase italic tracking-wide text-foreground pr-6 leading-tight">
                  {infoModal.title}
                </h3>
              </div>

              <p className="mt-3.5 whitespace-pre-line text-xs leading-relaxed text-muted">
                {infoModal.description}
              </p>

              <button
                onClick={() => setInfoModal(null)}
                className="mt-5 w-full rounded-xl bg-accent py-3 text-xs font-black uppercase tracking-wider text-background shadow-[0_0_20px_rgba(204,255,0,0.2)] transition-transform active:scale-95"
              >
                Entendido
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

function Metric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="min-w-0 px-2.5">
      <p className="truncate text-[7px] font-black uppercase tracking-[.16em] text-muted">{label}</p>
      <p className={`mt-1 truncate font-athletic text-sm font-black ${accent ? "text-accent" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}

function formatCountdown(value: number) {
  const seconds = Math.max(0, Math.floor(value / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(rest).padStart(2, "0")}s`;
}

function MarketCountdown({ scheduledAt }: { scheduledAt: number }) {
  const [remaining, setRemaining] = useState(() => scheduledAt - Date.now());

  useEffect(() => {
    const update = () => setRemaining(scheduledAt - Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [scheduledAt]);

  return remaining > 0
    ? <>Mercado fecha em {formatCountdown(remaining)}</>
    : <>Fechando mercado · Início da rodada iminente</>;
}

function Select({
  label,
  value,
  disabled,
  onChange,
  options,
  onInfoClick,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string | null) => void;
  options: { id: string; name: string }[];
  onInfoClick?: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-wider text-muted">{label}</span>
        {onInfoClick && (
          <button
            type="button"
            onClick={onInfoClick}
            className="flex h-5 w-5 items-center justify-center rounded-full text-muted hover:bg-white/10 hover:text-accent transition-colors"
            title="Mais informações"
            aria-label={`Informações sobre ${label}`}
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="relative">
        <select
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value || null)}
          className="h-11 w-full appearance-none rounded-xl border border-border bg-[#05100B] px-3.5 pr-8 text-xs font-bold text-foreground disabled:opacity-50 focus:border-accent outline-none transition-colors"
        >
          <option value="">Sem palpite</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted text-[10px]">
          ▼
        </div>
      </div>
    </div>
  );
}
