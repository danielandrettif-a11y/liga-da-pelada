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
  RotateCcw,
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
  type FantasyLiveProjection,
} from "@/lib/actions/fantasy";
import { supabase } from "@/lib/supabase";
import { useDialogViewport } from "@/lib/useDialogViewport";
import { getFantasySlotRoles, isCorrectFantasySlot } from "@/lib/fantasy/lineup-positions";
import { FantasyRadarCarousel } from "./FantasyRadarCarousel";
import { FantasyPackClaimBanner } from "./cards/FantasyPackClaimBanner";
import { FantasyActiveCardSlot } from "./cards/FantasyActiveCardSlot";
import type { FantasyActiveCardDTO, FantasyPackDTO } from "@/lib/actions/fantasy-cards";

const FantasyTutorialModal = dynamic(
  () => import("./FantasyTutorialModal").then((mod) => mod.FantasyTutorialModal),
  { ssr: false },
);
const FantasyTacticalAnnouncementModal = dynamic(
  () => import("./FantasyTacticalAnnouncementModal").then((mod) => mod.FantasyTacticalAnnouncementModal),
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
const FantasyScoringModal = dynamic(
  () => import("./FantasyScoringModal").then((mod) => mod.FantasyScoringModal),
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
  liveProjection?: FantasyLiveProjection;
  playersPerTeam?: number;
};

const positionLabel: Record<string, string> = {
  defensive: "Defesa",
  midfield: "Meio",
  offensive: "Ataque",
};

function lineupSignature({
  ids,
  captain,
  scorer,
  assist,
  challenge,
  slotRoles,
}: {
  ids: Array<string | null | undefined>;
  captain: string | null | undefined;
  scorer: string | null | undefined;
  assist: string | null | undefined;
  challenge: string | null | undefined;
  slotRoles?: string[];
}) {
  return JSON.stringify({
    // A ordem visual do campo pode mudar com drag-and-drop, mas não é uma alteração da escalação.
    ids: ids.filter(Boolean).sort(),
    captain: captain || null,
    scorer: scorer || null,
    assist: assist || null,
    challenge: challenge || null,
    slotRoles: slotRoles || null,
  });
}

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
  liveProjection,
  playersPerTeam = 5,
}: Props) {
  const router = useRouter();
  const initialIds = (lineup?.fantasy_lineup_players || []).map((item: any) => item.player_id as string);
  const storageKey = `fantasy_slots_${fantasySeasonId}_${round?.id || "portfolio"}`;

  // Esquema tático selecionado (ex: 2-1-2 ou 2-2-1)
  const [formation, setFormation] = useState<"2-1-2" | "2-2-1">(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(`fantasy_formation_${fantasySeasonId}`);
        if (saved === "2-1-2" || saved === "2-2-1") return saved;
      } catch {}
    }
    return playersPerTeam === 6 ? "2-1-2" : "2-2-1";
  });

  const [selected, setSelected] = useState<string[]>(() => {
    const slots = Array(playersPerTeam).fill("");
    if (!initialIds.length) return slots;

    // 1. Tentar restaurar o layout direto do banco de dados (slot_index salvo)
    const dbPlayers = (lineup?.fantasy_lineup_players || []).filter((item: any) => Boolean(item?.player_id));
    const hasDbSlots = dbPlayers.some((item: any) => typeof item.slot_index === "number" && item.slot_index >= 0 && item.slot_index < playersPerTeam);

    if (hasDbSlots) {
      const placed = new Set<string>();
      for (const item of dbPlayers) {
        if (
          typeof item.slot_index === "number" &&
          item.slot_index >= 0 &&
          item.slot_index < playersPerTeam &&
          !slots[item.slot_index]
        ) {
          slots[item.slot_index] = item.player_id;
          placed.add(item.player_id);
        }
      }
      // Se sobrou algum jogador sem slot_index válido, preencher nos primeiros vazios
      for (const item of dbPlayers) {
        if (!placed.has(item.player_id)) {
          const emptyIdx = slots.indexOf("");
          if (emptyIdx !== -1) {
            slots[emptyIdx] = item.player_id;
            placed.add(item.player_id);
          }
        }
      }
      return slots;
    }

    // 2. Tentar restaurar o layout exato de vagas salvo no cache do navegador
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem(storageKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length === playersPerTeam) {
            const parsedValid = parsed.filter(Boolean);
            const hasAll =
              initialIds.length === parsedValid.length &&
              initialIds.every((id: string) => parsedValid.includes(id));
            if (hasAll) {
              return parsed;
            }
          }
        }
      } catch {}
    }

    // 3. Fallback inteligente por perfil (apenas na 1ª vez sem cache/banco)
    const playerMap = new Map(market.map((p) => [p.id, p]));
    const remainingIds = [...initialIds];

    if (playersPerTeam === 6) {
      const gkSlot = 5;
      const gkIdx = remainingIds.findIndex((id) => (playerMap.get(id)?.goalkeeperGames || 0) > 0);
      if (gkIdx >= 0) {
        slots[gkSlot] = remainingIds[gkIdx];
        remainingIds.splice(gkIdx, 1);
      } else if (remainingIds.length === playersPerTeam) {
        slots[gkSlot] = remainingIds.pop()!;
      }
    }

    // Atacantes
    const ataSlots = playersPerTeam === 6
      ? (formation === "2-1-2" ? [0, 1] : [0])
      : (formation === "2-1-2" ? [0, 1] : [0]);
    for (const s of ataSlots) {
      if (slots[s] === "") {
        const ataIdx = remainingIds.findIndex((id) => playerMap.get(id)?.profile === "offensive");
        if (ataIdx >= 0) {
          slots[s] = remainingIds[ataIdx];
          remainingIds.splice(ataIdx, 1);
        }
      }
    }

    // Meias
    const meiSlots = playersPerTeam === 6
      ? (formation === "2-1-2" ? [2] : [1, 2])
      : (formation === "2-1-2" ? [2] : [1, 2]);
    for (const s of meiSlots) {
      if (slots[s] === "") {
        const meiIdx = remainingIds.findIndex((id) => {
          const p = playerMap.get(id);
          return p && (p.profile === "midfield" || !p.profile);
        });
        if (meiIdx >= 0) {
          slots[s] = remainingIds[meiIdx];
          remainingIds.splice(meiIdx, 1);
        }
      }
    }

    // Defensores
    const defSlots = [3, 4];
    for (const s of defSlots) {
      if (s < playersPerTeam && slots[s] === "") {
        const defIdx = remainingIds.findIndex((id) => playerMap.get(id)?.profile === "defensive");
        if (defIdx >= 0) {
          slots[s] = remainingIds[defIdx];
          remainingIds.splice(defIdx, 1);
        }
      }
    }

    // Restantes
    for (let i = 0; i < playersPerTeam; i++) {
      if (slots[i] === "" && remainingIds.length > 0) {
        slots[i] = remainingIds.shift()!;
      }
    }

    return slots;
  });

  // Sincronizar array de vagas quando a configuração da liga mudar (5 vs 6)
  useEffect(() => {
    setSelected((current) => {
      if (current.length === playersPerTeam) return current;
      if (current.length > playersPerTeam) {
        return current.slice(0, playersPerTeam);
      }
      const next = [...current];
      while (next.length < playersPerTeam) {
        next.push("");
      }
      return next;
    });
  }, [playersPerTeam]);

  // Salvar posições das vagas no cache local sempre que alterar
  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem(storageKey, JSON.stringify(selected));
      }
    } catch {}
  }, [selected, storageKey]);

  // Salvar esquema tático no cache local
  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem(`fantasy_formation_${fantasySeasonId}`, formation);
      }
    } catch {}
  }, [formation, fantasySeasonId]);
  const [targetSlot, setTargetSlot] = useState<number | null>(null);
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
  const [showScoringModal, setShowScoringModal] = useState(false);
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
    lineupSignature({
      ids: initialIds,
      captain: lineup?.captain_player_id,
      scorer: lineup?.top_scorer_player_id,
      assist: lineup?.top_assist_player_id,
      challenge: lineup?.challenge_player_id,
      slotRoles: getFantasySlotRoles(playersPerTeam, formation),
    })
  );
  const [pending, startTransition] = useTransition();
  const [isRefreshing, startRefreshTransition] = useTransition();
  const betweenRounds = status === "between_rounds";
  const open = status === "open" || betweenRounds;
  const isMarketClosed = !open && (status === "in_progress" || status === "finished");

  // V3: Bônus de orçamento temporário da carta Crédito Extra
  const budgetBonus = activeCard?.card?.effectType === "BUDGET_BONUS" ? (activeCard.card.effectConfig?.bonus || 5) : 0;
  const effectiveBudget = budget + budgetBonus;

  // V3: Desconto temporário no preço do jogador da carta Barganha
  const discountedPlayerId = activeCard?.card?.effectType === "PLAYER_DISCOUNT" ? activeCard.targetPlayerId : null;

  const selectedPlayers = selected.map((id) =>
    id ? market.find((player) => player.id === id) || null : null
  );

  const validSelectedPlayers = selectedPlayers.filter(Boolean) as FantasyMarketPlayer[];
  const validSelectedCount = validSelectedPlayers.length;

  const cost = validSelectedPlayers.reduce((sum, player) => {
    const isDiscounted = discountedPlayerId === player.id;
    const price = isDiscounted ? player.price * 0.8 : player.price;
    return sum + price;
  }, 0);

  const remaining = effectiveBudget - cost;


  // GOL não é tag: o filtro mostra o histórico real de atuações no rodízio.
  const [positionFilter, setPositionFilter] = useState<"ALL" | "GOL" | "DEF" | "MEI" | "ATA">("ALL");

  // Drag and drop / reposicionamento de atletas no campo
  const [draggedSlot, setDraggedSlot] = useState<number | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [touchDragPosition, setTouchDragPosition] = useState<{ x: number; y: number } | null>(null);

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
        // Prioridade por posição: jogadores da posição selecionada vêm primeiro
        if (positionFilter !== "ALL") {
          if (positionFilter === "GOL") {
            // Nível 1: quem tem melhor histórico no gol; nível 2: quem já atuou.
            // Nível 3: O resto dos atletas
            const getGkTier = (p: FantasyMarketPlayer) => {
              if (p.isGoodGoalkeeper) return 1;
              if ((p.goalkeeperGames || 0) > 0) return 2;
              return 3;
            };

            const tierA = getGkTier(a);
            const tierB = getGkTier(b);
            if (tierA !== tierB) {
              return tierA - tierB;
            }

            // Dentro do Tier 1 ou Tier 2, ordenar por melhor aproveitamento (menor média de gols sofridos)
            if (tierA <= 2) {
              const avgA = a.goalkeeperConcededAverage ?? 999;
              const avgB = b.goalkeeperConcededAverage ?? 999;
              if (avgA !== avgB) {
                return avgA - avgB;
              }
              // Desempate por mais jogos no gol
              if ((a.goalkeeperGames || 0) !== (b.goalkeeperGames || 0)) {
                return (b.goalkeeperGames || 0) - (a.goalkeeperGames || 0);
              }
            }
          } else {
            const getPosPriority = (p: FantasyMarketPlayer) => {
              if (positionFilter === "DEF") {
                return p.profile === "defensive" ? 3 : 0;
              }
              if (positionFilter === "MEI") {
                return p.profile === "midfield" ? 3 : !p.profile ? 1 : 0;
              }
              if (positionFilter === "ATA") {
                return p.profile === "offensive" ? 3 : 0;
              }
              return 0;
            };

            const prioA = getPosPriority(a);
            const prioB = getPosPriority(b);
            if (prioA !== prioB) {
              return prioB - prioA;
            }
          }
        }

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
  }, [market, query, sort, filterTag, positionFilter]);

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

  const currentSignature = lineupSignature({
    ids: selected,
    captain: captainId,
    scorer: scorerId,
    assist: assistId,
    challenge: challengeId,
    slotRoles: getFantasySlotRoles(playersPerTeam, formation),
  });
  const hasUnsavedChanges = open && savedSignature !== currentSignature;
  const complete = validSelectedCount === playersPerTeam && Boolean(captainId) && remaining >= 0;
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
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `round_id=eq.${round.id}` }, () => requestRefresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "player_round_stats", filter: `round_id=eq.${round.id}` }, () => requestRefresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [requestRefresh, round, status]);

  useEffect(() => {
    if (status !== "in_progress") return;
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") requestRefresh(0);
    };
    const interval = window.setInterval(refreshIfVisible, 15_000);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [requestRefresh, status]);

  function refreshLivePoints() {
    startRefreshTransition(() => router.refresh());
  }

  useEffect(() => {
    const channel = supabase
      .channel(`fantasy-market-players-${round?.id || "analysis"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "players" }, () => requestRefresh(750))
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [requestRefresh, round?.id]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const message = validSelectedCount === playersPerTeam && !captainId
      ? "Você ainda não escolheu o capitão. Tem certeza que quer sair sem salvar e completar a escalação?"
      : "Você tem alterações na escalação que ainda não foram salvas. Deseja sair mesmo assim?";
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const interceptLink = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.href === window.location.href) return;
      if (!window.confirm(message)) event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", interceptLink, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", interceptLink, true);
    };
  }, [captainId, hasUnsavedChanges, playersPerTeam, validSelectedCount]);

  function sellAll() {
    if (!selected.some(Boolean)) return;
    if (!window.confirm("Vender todos os jogadores? A mudança só será aplicada quando você salvar a escalação.")) return;
    setSelected(Array(playersPerTeam).fill(""));
    setCaptainId(null);
    setScorerId(null);
    setAssistId(null);
    setChallengeId(null);
    setTargetSlot(null);
    setMessage("Elenco limpo. Salve para confirmar a venda de todos.");
  }

  function togglePlayer(player: FantasyMarketPlayer) {
    if (!open) {
      setSelectedDrawerPlayer(player);
      return;
    }
    // Se o jogador já está escalado, VENDER / REMOVER ele da vaga dele sem empurrar os demais:
    if (selected.includes(player.id)) {
      setSelected((current) => current.map((id) => (id === player.id ? "" : id)));
      if (captainId === player.id) setCaptainId(null);
      return;
    }

    const currentCount = selected.filter(Boolean).length;
    if (currentCount >= playersPerTeam) return setMessage(`Sua escalação já tem ${playersPerTeam} jogadores.`);
    if (player.price > remaining) return setMessage("Patrimônio insuficiente para comprar este jogador.");

    // Inserir no slot de destino clicado ou no primeiro slot vazio:
    setSelected((current) => {
      const next = [...current];
      while (next.length < playersPerTeam) {
        next.push("");
      }
      if (targetSlot !== null && targetSlot >= 0 && targetSlot < playersPerTeam && !next[targetSlot]) {
        next[targetSlot] = player.id;
      } else {
        const firstEmpty = next.findIndex((id) => !id);
        if (firstEmpty !== -1) {
          next[firstEmpty] = player.id;
        } else {
          next.push(player.id);
        }
      }
      return next;
    });

    setTargetSlot(null);
    setMessage("");
    if (currentCount + 1 === playersPerTeam) {
      setTimeout(() => {
        setActiveTab("team");
      }, 250);
    }
  }

  function save() {
    const normalizedSelected = selected.slice(0, playersPerTeam);
    const validPlayerIds = normalizedSelected.filter(Boolean);
    const slotRoles = getFantasySlotRoles(playersPerTeam, formation);
    const slotAssignments = normalizedSelected.flatMap((playerId, slotIndex) =>
      playerId
        ? [{ playerId, slotIndex, slotRole: slotRoles[slotIndex] || "MEI" }]
        : [],
    );
    startTransition(async () => {
      try {
        const result = await saveFantasyLineup({
          fantasySeasonId,
          roundId: betweenRounds ? null : round?.id || null,
            playerIds: validPlayerIds,
            slotAssignments,
          captainId,
          scorerId,
          assistId,
          challengeId: betweenRounds ? null : challengeId,
        });
        setMessage(
          result.success
            ? betweenRounds
              ? "Elenco permanente salvo para a próxima Ranked!"
              : validPlayerIds.length === playersPerTeam && captainId
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

  function swapSlots(sourceIndex: number, targetIndex: number) {
    if (sourceIndex === targetIndex || isNaN(sourceIndex) || isNaN(targetIndex) || !open) return;
    setSelected((prev) => {
      const next = [...prev];
      while (next.length <= Math.max(sourceIndex, targetIndex)) {
        next.push("");
      }
      const temp = next[sourceIndex] || "";
      next[sourceIndex] = next[targetIndex] || "";
      next[targetIndex] = temp;
      return next;
    });
  }

  function renderSlot(
    slot: number,
    roleLabel: string,
    targetPos: "ALL" | "GOL" | "DEF" | "MEI" | "ATA" = "ALL"
  ) {
    const player = selectedPlayers[slot];
    const isBeingDragged = draggedSlot === slot;
    const isDragOver = dragOverSlot === slot;

    // O mesmo critério persistido no servidor decide o selo e o pacote de pontos.
    const isCorrectPosition = Boolean(
      player && targetPos !== "ALL" && isCorrectFantasySlot(targetPos, player.profile),
    );

    return (
      <div
        key={slot}
        data-slot-index={slot}
        draggable={open && Boolean(player)}
        onDragStart={(e) => {
          if (!open || !player) return;
          e.dataTransfer.setData("text/plain", String(slot));
          e.dataTransfer.effectAllowed = "move";
          setDraggedSlot(slot);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (dragOverSlot !== slot) {
            setDragOverSlot(slot);
          }
        }}
        onDragLeave={() => {
          if (dragOverSlot === slot) {
            setDragOverSlot(null);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          const source = Number(e.dataTransfer.getData("text/plain"));
          if (!isNaN(source)) {
            swapSlots(source, slot);
          }
          setDraggedSlot(null);
          setDragOverSlot(null);
        }}
        onDragEnd={() => {
          setDraggedSlot(null);
          setDragOverSlot(null);
        }}
        onTouchStart={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest("[data-no-drag]")) return;
          if (!open || !player) return;
          const touch = e.touches[0];
          setDraggedSlot(slot);
          setTouchDragPosition({ x: touch.clientX, y: touch.clientY });
          if (typeof navigator !== "undefined" && navigator.vibrate) {
            navigator.vibrate(20);
          }
        }}
        onTouchMove={(e) => {
          if (draggedSlot === null) return;
          const touch = e.touches[0];
          setTouchDragPosition({ x: touch.clientX, y: touch.clientY });
          const element = document.elementFromPoint(touch.clientX, touch.clientY);
          const slotEl = element?.closest("[data-slot-index]");
          if (slotEl) {
            const overIndex = Number(slotEl.getAttribute("data-slot-index"));
            if (!isNaN(overIndex) && dragOverSlot !== overIndex) {
              setDragOverSlot(overIndex);
              if (typeof navigator !== "undefined" && navigator.vibrate) {
                navigator.vibrate(10);
              }
            }
          }
        }}
        onTouchEnd={() => {
          if (draggedSlot !== null && dragOverSlot !== null && draggedSlot !== dragOverSlot) {
            swapSlots(draggedSlot, dragOverSlot);
            if (typeof navigator !== "undefined" && navigator.vibrate) {
              navigator.vibrate([20, 30, 20]);
            }
          }
          setDraggedSlot(null);
          setDragOverSlot(null);
          setTouchDragPosition(null);
        }}
        onTouchCancel={() => {
          setDraggedSlot(null);
          setDragOverSlot(null);
          setTouchDragPosition(null);
        }}
        style={{ touchAction: open && Boolean(player) ? "none" : "auto" }}
        className={`relative mx-auto flex w-full max-w-32 flex-col items-center transition-all duration-200 select-none ${
          open && Boolean(player) ? "cursor-grab active:cursor-grabbing" : ""
        } ${
          isBeingDragged
            ? "opacity-30 scale-90 rotate-2 ring-2 ring-dashed ring-accent/60 rounded-2xl"
            : isDragOver
            ? "scale-110 ring-4 ring-accent bg-accent/30 rounded-2xl shadow-[0_0_30px_rgba(204,255,0,0.8)] z-20"
            : ""
        }`}
      >
        {player ? (
          <div className="relative w-full flex flex-col items-center">
            {/* Botão de Capitão (Direita) - Isolado de eventos de arrasto */}
            <button
              type="button"
              data-no-drag="true"
              disabled={!open}
              onClick={(e) => {
                e.stopPropagation();
                setCaptainId((prev) => (prev === player.id ? null : player.id));
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
              }}
              onTouchEnd={(e) => {
                e.stopPropagation();
                if (open) {
                  setCaptainId((prev) => (prev === player.id ? null : player.id));
                  if (typeof navigator !== "undefined" && navigator.vibrate) {
                    navigator.vibrate(15);
                  }
                }
              }}
              className={`absolute -right-1 -top-1.5 z-30 flex h-7 w-7 items-center justify-center rounded-full border shadow-md transition-transform active:scale-90 touch-manipulation ${
                captainId === player.id
                  ? "border-accent bg-accent text-background scale-110 shadow-[0_0_12px_rgba(204,255,0,0.6)]"
                  : "border-white/20 bg-background text-muted hover:text-white"
              }`}
              aria-label={captainId === player.id ? `Remover capitão de ${player.name}` : `Escolher ${player.name} como capitão`}
              title={captainId === player.id ? "Remover Capitão" : "Tornar Capitão (Pontos 1.5x)"}
            >
              <Crown className="h-4 w-4 pointer-events-none" />
            </button>

            <button
              type="button"
              onClick={() => setSelectedDrawerPlayer(player)}
              className="flex flex-col items-center group"
            >
              <div className="relative">
                <PlayerAvatar
                  name={player.name}
                  avatarUrl={player.avatarUrl}
                  clickable={false}
                  className={`h-14 w-14 rounded-full border-2 bg-background text-sm font-black shadow-lg transition-all group-active:scale-95 ${
                    captainId === player.id
                      ? "border-accent ring-2 ring-accent/60 shadow-[0_0_15px_rgba(204,255,0,0.6)]"
                      : isCorrectPosition
                      ? "border-accent ring-2 ring-accent/60 shadow-[0_0_10px_rgba(204,255,0,0.4)]"
                      : "border-white/25 opacity-90"
                  }`}
                />
                {isCorrectPosition && (
                  <span
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 z-10 flex items-center gap-0.5 whitespace-nowrap rounded-full border border-accent/80 bg-[#06180e] px-1.5 py-0.2 text-[7px] font-black uppercase tracking-wider text-accent shadow-[0_0_8px_rgba(204,255,0,0.6)] animate-fade-in"
                    title="Posição ideal! Bônus tático ativado."
                  >
                    ⚡ BÔNUS
                  </span>
                )}
              </div>
              <span className="mt-1 max-w-32 truncate rounded-lg bg-black/85 px-2 py-0.5 text-center text-[10px] font-black leading-tight text-white shadow-sm">
                {player.name}
              </span>
              <span className="mt-0.5 text-[9px] font-black text-accent drop-shadow">
                {status === "in_progress"
                  ? `${(
                      player.roundPoints *
                      (captainId === player.id ? settings.captainMultiplier : 1)
                    ).toFixed(1)} pts`
                  : `${player.roundPoints.toFixed(1)} pts`}
              </span>
              <span className="text-[8px] font-bold text-white/70">
                {formatFantasyMoney(player.price, settings.currencyName)}
              </span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setTargetSlot(slot);
              setPositionFilter(targetPos);
              setFilterTag("ALL");
              setActiveTab("market");
            }}
            className="mx-auto flex h-18 w-24 flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-300/40 bg-black/25 text-center shadow-inner transition hover:border-accent hover:bg-black/40 active:scale-95 group"
          >
            <span className="text-[10px] font-bold text-accent group-hover:scale-105 transition-transform">+ Vaga {slot + 1}</span>
            <span className="text-[8px] text-emerald-200/60 font-semibold uppercase">{roleLabel}</span>
          </button>
        )}
      </div>
    );
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
                  : `Ranked ${round?.number || ""} · escale ${playersPerTeam} craques`}
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
              label={status === "in_progress" ? "Ao vivo" : betweenRounds ? "Pontos" : "Escalação"}
              value={status === "in_progress" ? `${(liveProjection?.currentUser?.totalPoints || 0).toFixed(1)} pts` : betweenRounds ? account.totalPoints.toFixed(1) : formatFantasyMoney(cost, settings.currencyName)}
            />
            <Metric
              label={betweenRounds ? "Melhor rodada" : "Restante"}
              value={betweenRounds ? `${account.bestRoundPoints.toFixed(1)} pts` : formatFantasyMoney(remaining, settings.currencyName)}
              accent={betweenRounds || remaining >= 0}
            />
          </div>
          {status === "in_progress" && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-accent/20 bg-accent/10 px-3 py-2 text-[10px] font-bold text-accent">
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> Prévia ao vivo</span>
              <button type="button" onClick={refreshLivePoints} disabled={isRefreshing} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-black hover:bg-accent/15 disabled:opacity-50">
                <RotateCcw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} /> Atualizar pontos
              </button>
            </div>
          )}
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
        <section className="overflow-hidden rounded-2xl border border-accent/25 bg-gradient-to-br from-[#0b2415] via-surface to-[#10190d] shadow-[0_12px_30px_rgba(0,0,0,.2)]">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/25">
                <Trophy className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-[.18em] text-accent">Boletim final</p>
                <p className="mt-0.5 text-sm font-black text-foreground">Ranked {String(lastRound.number).padStart(2, "0")}</p>
                <p className="text-[10px] text-muted">Sua atuação na última rodada</p>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <strong className="block text-2xl font-black leading-none text-accent">{lastRound.totalPoints.toFixed(1)}</strong>
              <span className="text-[9px] font-black uppercase tracking-[.14em] text-muted">pontos</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 p-3">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="text-[9px] font-black uppercase tracking-[.12em] text-muted">Em campo</p>
              <p className="mt-1 text-lg font-black text-foreground">{lastRound.playerPoints.toFixed(1)} <span className="text-[10px] text-muted">pts</span></p>
            </div>
            <div className="rounded-xl border border-warning/20 bg-warning/10 p-3">
              <p className="text-[9px] font-black uppercase tracking-[.12em] text-warning">Palpites e extras</p>
              <p className="mt-1 text-lg font-black text-warning">+{lastRound.predictionPoints.toFixed(1)} <span className="text-[10px] text-warning/70">pts</span></p>
            </div>
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
                O mercado fechou! Toque para ver os {playersPerTeam} jogadores, capitão e palpites de todos os rivais.
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
          onClick={() => setShowScoringModal(true)}
          className="group flex min-w-0 flex-col items-center gap-2 rounded-2xl border border-accent/30 bg-accent/[.08] px-1.5 py-3 text-center transition-colors hover:border-accent/60 hover:bg-accent/15"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-background font-black text-sm shadow-md shadow-accent/25">
            ⚡
          </span>
          <span className="truncate text-[10px] font-black text-accent">Pontuação</span>
        </button>
      </nav>

      {/* SELETOR DE ABAS PRINCIPAIS (MEU TIME × MERCADO) */}
      <div className="sticky top-[calc(4rem+env(safe-area-inset-top)+0.5rem)] z-30 -mx-1 rounded-2xl border border-border bg-[#05100B]/95 p-1.5 backdrop-blur-xl shadow-[0_12px_35px_rgba(0,0,0,.35)]">
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
                  : validSelectedCount === playersPerTeam
                  ? "bg-success/20 text-success"
                  : "bg-white/10 text-muted"
              }`}
            >
              {validSelectedCount}/{playersPerTeam}
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
                  {open ? "Toque na coroa para escolher o capitão (1,5x)" : "Escalação somente para consulta"}
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
              <div className="flex items-center gap-2">
                {open && selected.length > 0 && (
                  <button type="button" onClick={sellAll} className="rounded-xl border border-danger/35 bg-danger/10 px-2.5 py-1.5 text-[10px] font-black text-danger transition-colors hover:bg-danger/20">Vender todos</button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveTab("market")}
                  className="rounded-xl border border-accent/40 bg-accent/15 px-3 py-1.5 text-xs font-black text-accent hover:bg-accent/25 transition-colors shadow-sm"
                >
                  + Mercado ({market.length})
                </button>
              </div>
            </div>

            {open && selected.length === playersPerTeam && !captainId && (
              <p className="rounded-xl border border-warning/35 bg-warning/10 px-3 py-2 text-[10px] font-bold text-warning">Falta escolher o capitão antes de concluir sua escalação.</p>
            )}
            {open && (!scorerId || !assistId) && (
              <p className="text-[10px] font-bold text-muted">Palpites são opcionais, mas rendem pontos: {!scorerId && "artilheiro"}{!scorerId && !assistId && " e "}{!assistId && "garçom"} ainda não foram escolhidos.</p>
            )}

            {status === "in_progress" && (
              <div className="grid grid-cols-2 gap-2 rounded-2xl border border-accent/30 bg-gradient-to-r from-accent/15 to-surface p-3">
                <div>
                  <p className="text-[8px] font-black uppercase tracking-[.16em] text-muted">Sua rodada · prévia</p>
                  <p className="mt-1 text-2xl font-black text-accent">{(liveProjection?.currentUser?.totalPoints || 0).toFixed(1)} pts</p>
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 self-end text-right text-[9px] font-bold text-muted">
                  <span>Jogadores</span><strong className="text-foreground">{(liveProjection?.currentUser?.playerPoints || 0).toFixed(1)}</strong>
                  <span>Capitão</span><strong className="text-foreground">+{(liveProjection?.currentUser?.captainBonus || 0).toFixed(1)}</strong>
                  <span>Palpites/cartas</span><strong className="text-foreground">+{((liveProjection?.currentUser?.predictionPoints || 0) + (liveProjection?.currentUser?.cardPoints || 0)).toFixed(1)}</strong>
                </div>
                <p className="col-span-2 border-t border-accent/15 pt-2 text-[9px] font-bold text-muted">Temporada se terminasse agora: <span className="text-foreground">{(account.totalPoints + (liveProjection?.currentUser?.totalPoints || 0)).toFixed(1)} pts</span></p>
              </div>
            )}

            {/* SELETOR DE ESQUEMA TÁTICO */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-black/40 px-3.5 py-2 shadow-inner">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[9px] font-black uppercase tracking-wider text-muted truncate">
                    Esquema Tático:
                  </span>
                  <span className="font-athletic text-xs font-black uppercase italic text-accent shrink-0">
                    {formation}
                  </span>
                </div>
                <div className="flex rounded-xl bg-black/60 p-0.5 border border-white/10 shrink-0">
                  <button
                    type="button"
                    onClick={() => setFormation("2-1-2")}
                    className={`rounded-lg px-2.5 py-1 font-athletic text-[10px] font-black uppercase transition-all ${
                      formation === "2-1-2"
                        ? "bg-accent text-background shadow-sm"
                        : "text-muted hover:text-white"
                    }`}
                  >
                    2-1-2 (2 ATA)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormation("2-2-1")}
                    className={`rounded-lg px-2.5 py-1 font-athletic text-[10px] font-black uppercase transition-all ${
                      formation === "2-2-1"
                        ? "bg-accent text-background shadow-sm"
                        : "text-muted hover:text-white"
                    }`}
                  >
                    2-2-1 (2 MEI)
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-0.5">
                <button
                  type="button"
                  onClick={() => setShowScoringModal(true)}
                  className="flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/15 px-2.5 py-1 text-[9px] font-black text-accent hover:bg-accent hover:text-background transition-all shadow-xs"
                >
                  <span>⚡ Guia de Pontuação & Bônus</span>
                  <span className="rounded bg-accent/25 px-1 py-0.2 text-[8px] font-black">Ver Tabela</span>
                </button>
                {open && validSelectedCount > 1 && (
                  <p className="text-[9px] font-semibold text-emerald-200/70">
                    🖐️ Arraste os atletas pelo campo
                  </p>
                )}
              </div>
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

              {/* RENDERIZAÇÃO ADAPTÁVEL DO CAMPO (5 vs 6 JOGADORES) */}
              {playersPerTeam === 6 ? (
                formation === "2-1-2" ? (
                  <div className="relative z-10 flex min-h-[480px] flex-col justify-between py-2">
                    {/* 1. Pontas Abertos (Ataque - 2 vagas) */}
                    <div>
                      <span className="block text-center font-athletic text-[8px] font-black uppercase italic tracking-[0.2em] text-emerald-200/50 mb-1">
                        Pontas Abertos (Ataque)
                      </span>
                      <div className="grid grid-cols-2 gap-2 px-1 sm:px-4">
                        {[0, 1].map((slot) => renderSlot(slot, "Ponta / ATA", "ATA"))}
                      </div>
                    </div>

                    {/* 2. Meio Avançado (Armador - 1 vaga) */}
                    <div>
                      <span className="block text-center font-athletic text-[8px] font-black uppercase italic tracking-[0.2em] text-emerald-200/50 mb-1">
                        Meio Avançado (Armador)
                      </span>
                      <div className="flex justify-center">
                        {renderSlot(2, "Meia / ALA", "MEI")}
                      </div>
                    </div>

                    {/* 3. Linha Defensiva (2 vagas) */}
                    <div>
                      <span className="block text-center font-athletic text-[8px] font-black uppercase italic tracking-[0.2em] text-emerald-200/50 mb-1">
                        Linha Defensiva
                      </span>
                      <div className="grid grid-cols-2 gap-2 px-1 sm:px-4">
                        {[3, 4].map((slot) => renderSlot(slot, "Defensor / DEF", "DEF"))}
                      </div>
                    </div>

                    {/* 4. Goleiro (1 vaga) */}
                    <div>
                      <span className="block text-center font-athletic text-[8px] font-black uppercase italic tracking-[0.2em] text-emerald-200/50 mb-1">
                        Goleiro
                      </span>
                      <div className="flex justify-center">
                        {renderSlot(5, "Goleiro / GOL", "GOL")}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="relative z-10 flex min-h-[480px] flex-col justify-between py-2">
                    {/* 1. Centroavante (Ataque - 1 vaga) */}
                    <div>
                      <span className="block text-center font-athletic text-[8px] font-black uppercase italic tracking-[0.2em] text-emerald-200/50 mb-1">
                        Centroavante (Ataque)
                      </span>
                      <div className="flex justify-center">
                        {renderSlot(0, "Atacante / ATA", "ATA")}
                      </div>
                    </div>

                    {/* 2. Meio-Campo & Alas (2 vagas) */}
                    <div>
                      <span className="block text-center font-athletic text-[8px] font-black uppercase italic tracking-[0.2em] text-emerald-200/50 mb-1">
                        Meio-Campo & Alas
                      </span>
                      <div className="grid grid-cols-2 gap-2 px-1 sm:px-4">
                        {[1, 2].map((slot) => renderSlot(slot, "Meia / ALA", "MEI"))}
                      </div>
                    </div>

                    {/* 3. Linha Defensiva (2 vagas) */}
                    <div>
                      <span className="block text-center font-athletic text-[8px] font-black uppercase italic tracking-[0.2em] text-emerald-200/50 mb-1">
                        Linha Defensiva
                      </span>
                      <div className="grid grid-cols-2 gap-2 px-1 sm:px-4">
                        {[3, 4].map((slot) => renderSlot(slot, "Defensor / DEF", "DEF"))}
                      </div>
                    </div>

                    {/* 4. Goleiro (1 vaga) */}
                    <div>
                      <span className="block text-center font-athletic text-[8px] font-black uppercase italic tracking-[0.2em] text-emerald-200/50 mb-1">
                        Goleiro
                      </span>
                      <div className="flex justify-center">
                        {renderSlot(5, "Goleiro / GOL", "GOL")}
                      </div>
                    </div>
                  </div>
                )
              ) : (
                formation === "2-2-1" ? (
                  <div className="relative z-10 flex min-h-[448px] flex-col justify-between py-2">
                    {/* 1. Centroavante (1 vaga) */}
                    <div>
                      <span className="block text-center font-athletic text-[8px] font-black uppercase italic tracking-[0.2em] text-emerald-200/50 mb-1">
                        Centroavante (Ataque)
                      </span>
                      <div className="flex justify-center">
                        {renderSlot(0, "Atacante / ATA", "ATA")}
                      </div>
                    </div>

                    {/* 2. Meio-Campo & Alas (2 vagas) */}
                    <div>
                      <span className="block text-center font-athletic text-[8px] font-black uppercase italic tracking-[0.2em] text-emerald-200/50 mb-1">
                        Meio-Campo & Alas
                      </span>
                      <div className="grid grid-cols-2 gap-2 px-1 sm:px-4">
                        {[1, 2].map((slot) => renderSlot(slot, "Meia / ALA", "MEI"))}
                      </div>
                    </div>

                    {/* 3. Linha Defensiva (2 vagas) */}
                    <div>
                      <span className="block text-center font-athletic text-[8px] font-black uppercase italic tracking-[0.2em] text-emerald-200/50 mb-1">
                        Linha Defensiva
                      </span>
                      <div className="grid grid-cols-2 gap-2 px-1 sm:px-4">
                        {[3, 4].map((slot) => renderSlot(slot, "Defensor / DEF", "DEF"))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="relative z-10 flex min-h-[448px] flex-col justify-between py-2">
                    {/* 1. Ataque (2 vagas) */}
                    <div>
                      <span className="block text-center font-athletic text-[8px] font-black uppercase italic tracking-[0.2em] text-emerald-200/50 mb-1">
                        Ataque
                      </span>
                      <div className="grid grid-cols-2 gap-2 px-1 sm:px-4">
                        {[0, 1].map((slot) => renderSlot(slot, "Atacante / ATA", "ATA"))}
                      </div>
                    </div>

                    {/* 2. Meio-Campo & Alas (1 vaga) */}
                    <div>
                      <span className="block text-center font-athletic text-[8px] font-black uppercase italic tracking-[0.2em] text-emerald-200/50 mb-1">
                        Meio-Campo & Alas
                      </span>
                      <div className="flex justify-center">
                        {renderSlot(2, "Meia / ALA", "MEI")}
                      </div>
                    </div>

                    {/* 3. Linha Defensiva (2 vagas) */}
                    <div>
                      <span className="block text-center font-athletic text-[8px] font-black uppercase italic tracking-[0.2em] text-emerald-200/50 mb-1">
                        Linha Defensiva
                      </span>
                      <div className="grid grid-cols-2 gap-2 px-1 sm:px-4">
                        {[3, 4].map((slot) => renderSlot(slot, "Defensor / DEF", "DEF"))}
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>

            {/* V3: SLOT DE CARTA ESPECIAL ATIVA */}
            {!betweenRounds && round && (
              <FantasyActiveCardSlot
                roundId={round.id}
                activeCard={activeCard}
                isMarketOpen={open}
                marketPlayers={market}
                lineupPlayers={validSelectedPlayers}
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
                    · {selected.length}/{playersPerTeam} escalados
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("team")}
                className="shrink-0 rounded-xl bg-accent px-3 py-1.5 text-xs font-black uppercase tracking-tight text-background shadow transition-transform active:scale-95"
              >
                Ver Time ({selected.length}/{playersPerTeam}) →
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

            {/* Chips de Filtros de Posição */}
            <div className="no-scrollbar -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5 text-[9px] font-black uppercase tracking-wider">
              <span className="text-[8px] font-bold text-muted shrink-0 mr-0.5">Posição:</span>
              {[
                { id: "ALL", label: "Todas" },
                { id: "GOL", label: "🧤 Rodízio no gol" },
                { id: "DEF", label: "🛡️ Zaga (DEF)" },
                { id: "MEI", label: "🎯 Meio (MEI/ALA)" },
                { id: "ATA", label: "⚡ Ataque (ATA)" },
              ].map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setPositionFilter(chip.id as any)}
                  className={`shrink-0 rounded-xl px-2.5 py-1.5 transition-all border ${
                    positionFilter === chip.id
                      ? "border-accent bg-accent text-background font-black shadow-sm"
                      : "border-white/10 bg-surface/70 text-muted hover:text-foreground"
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Aviso de priorização da posição selecionada */}
            {positionFilter !== "ALL" && (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-1.5 text-[10px] text-accent">
                <span className="font-bold">
                  {positionFilter === "GOL" ? (
                    <>✨ <strong>Atletas com melhor histórico no gol</strong> no topo</>
                  ) : (
                    <>✨ Atletas de <strong>{
                      positionFilter === "DEF" ? "Defesa (DEF)" :
                      positionFilter === "MEI" ? "Meio / Ala (MEI/ALA)" : "Ataque (ATA)"
                    }</strong> no topo primeiro</>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setPositionFilter("ALL")}
                  className="font-black text-[9px] uppercase tracking-wider text-muted hover:text-white underline"
                >
                  Limpar
                </button>
              </div>
            )}

            {/* Chips de Filtros Rápidos */}
            <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 text-[9px] font-black uppercase tracking-wider">
              {[
                { id: "ALL", label: "Todos os Status" },
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
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="truncate text-xs font-black text-foreground hover:text-accent transition-colors">
                            {player.name}
                          </p>
                          {/* Badge de Posição */}
                          {player.profile === "defensive" ? (
                            <span className="rounded bg-blue-500/20 px-1.5 py-0.2 text-[8px] font-black uppercase text-blue-300 border border-blue-500/30">
                              DEF
                            </span>
                          ) : player.profile === "offensive" ? (
                            <span className="rounded bg-danger/20 px-1.5 py-0.2 text-[8px] font-black uppercase text-danger border border-danger/30">
                              ATA
                            </span>
                          ) : (
                            <span className="rounded bg-warning/20 px-1.5 py-0.2 text-[8px] font-black uppercase text-warning border border-warning/30">
                              MEI/ALA
                            </span>
                          )}
                          <span className="text-[8px] font-bold text-muted ml-auto">
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

                        <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.06] px-2 py-1 text-[8px] font-semibold text-emerald-100/85">
                          <span className="font-black text-emerald-300">🧤 No gol:</span>
                          {player.goalkeeperGames > 0 ? (
                            <>
                              <span><strong className="text-foreground">{player.goalkeeperGames}</strong> {player.goalkeeperGames === 1 ? "partida" : "partidas"}</span>
                              <span className="text-emerald-200/45">·</span>
                              <span><strong className="text-foreground">{player.goalsConceded}</strong> {player.goalsConceded === 1 ? "gol tomado" : "gols tomados"}</span>
                              <span className="text-emerald-200/45">·</span>
                              <span>média <strong className="text-accent">{player.goalkeeperConcededAverage?.toFixed(2)}</strong>/jogo</span>
                            </>
                          ) : (
                            <span className="text-muted">sem partidas no rodízio</span>
                          )}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px]">
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
                            {player.priceChange !== 0 && (
                              <span className="ml-0.5 font-bold opacity-90">
                                ({player.priceChange > 0 ? "+" : ""}
                                {formatFantasyMoney(player.priceChange, settings.currencyName)})
                              </span>
                            )}
                          </span>
                          {player.roundPoints !== 0 && (
                            <span className="text-muted font-semibold">
                              · Última: <span className="font-bold text-foreground">{player.roundPoints.toFixed(1)} pts</span>
                            </span>
                          )}
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
          lineupPlayers={validSelectedPlayers}
          captainPlayerId={captainId}
          onCardActivated={() => requestRefresh(0)}
        />
      )}

      {/* MODAL DE TUTORIAL & MODAL DE SISTEMA DE PONTUAÇÃO */}
      {showTutorial && <FantasyTutorialModal isOpen={showTutorial} onClose={() => setShowTutorial(false)} />}
      {showScoringModal && <FantasyScoringModal isOpen={showScoringModal} onClose={() => setShowScoringModal(false)} settings={settings} />}

      {/* MODAL DE ANÚNCIO DA REVOLUÇÃO TÁTICA (RODADA 02) */}
      <FantasyTacticalAnnouncementModal />

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

      {/* PREVIEW FLUTUANTE DE ARRASTAR NO CELULAR */}
      {touchDragPosition &&
        draggedSlot !== null &&
        selectedPlayers[draggedSlot] &&
        mounted &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[99999] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center opacity-95 scale-110 drop-shadow-[0_20px_40px_rgba(0,0,0,0.95)]"
            style={{ left: touchDragPosition.x, top: touchDragPosition.y }}
          >
            <PlayerAvatar
              name={selectedPlayers[draggedSlot]!.name}
              avatarUrl={selectedPlayers[draggedSlot]!.avatarUrl}
              clickable={false}
              className="h-16 w-16 rounded-full border-4 border-accent ring-4 ring-accent/40 shadow-2xl bg-background"
            />
            <span className="mt-1 max-w-32 truncate rounded-lg bg-black/95 px-2.5 py-0.5 text-center text-[10px] font-black text-accent border border-accent/40 shadow-lg">
              {selectedPlayers[draggedSlot]!.name}
            </span>
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
