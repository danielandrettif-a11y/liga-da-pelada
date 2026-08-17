"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock, Crown, HelpCircle, Lock, Search, Target, TrendingUp, Trophy, X } from "@/components/icons";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { formatFantasyMoney, type FantasySettings } from "@/lib/fantasy/config";
import { CHALLENGE_LABELS, fantasyChallengeOffer, type FantasyChallengeType } from "@/lib/fantasy/challenges";
import { saveFantasyLineup, type FantasyDashboardInsights, type FantasyMarketPlayer } from "@/lib/actions/fantasy";
import { supabase } from "@/lib/supabase";
import { FantasyTutorialModal } from "./FantasyTutorialModal";

type Props = {
  round: { id: string; number: number; date: string; start_time: string | null; teams?: { id: string; name: string; color: string }[] } | null;
  fantasySeasonId: string;
  status: string;
  settings: FantasySettings;
  market: FantasyMarketPlayer[];
  budget: number;
  lineup: any;
  insights: FantasyDashboardInsights;
  account: { totalPoints: number; roundsPlayed: number; bestRoundPoints: number };
  isTest?: boolean;
  lastRound?: { number: number; date: string; playerPoints: number; predictionPoints: number; totalPoints: number } | null;
  challengeType?: FantasyChallengeType | null;
};

const positionLabel: Record<string, string> = { defensive: "Defesa", midfield: "Meio", offensive: "Ataque" };

export function FantasyExperience({ round, fantasySeasonId, status, settings, market, budget, lineup, insights, account, isTest = false, lastRound = null, challengeType = null }: Props) {
  const router = useRouter();
  const initialIds = (lineup?.fantasy_lineup_players || []).map((item: any) => item.player_id as string);
  const [selected, setSelected] = useState<string[]>(initialIds);
  const [captainId, setCaptainId] = useState<string | null>(lineup?.captain_player_id || null);
  const [scorerId, setScorerId] = useState<string | null>(lineup?.top_scorer_player_id || null);
  const [assistId, setAssistId] = useState<string | null>(lineup?.top_assist_player_id || null);
  const [challengeId, setChallengeId] = useState<string | null>(lineup?.challenge_player_id || null);
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("points");
  const [message, setMessage] = useState("");
  const [showTutorial, setShowTutorial] = useState(false);
  const [infoModal, setInfoModal] = useState<{ title: string; description: string } | null>(null);

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
  const [savedSignature, setSavedSignature] = useState(() => lineup ? JSON.stringify({ ids: initialIds, captain: lineup?.captain_player_id || null, scorer: lineup?.top_scorer_player_id || null, assist: lineup?.top_assist_player_id || null, challenge: lineup?.challenge_player_id || null }) : "");
  const [pending, startTransition] = useTransition();
  const betweenRounds = status === "between_rounds";
  const open = status === "open" || betweenRounds;
  const selectedPlayers = selected.map((id) => market.find((player) => player.id === id)).filter(Boolean) as FantasyMarketPlayer[];
  const cost = selectedPlayers.reduce((sum, player) => sum + player.price, 0);
  const remaining = budget - cost;
  const filtered = useMemo(() => [...market]
    .filter((player) => player.name.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")))
    .sort((a, b) => sort === "price" ? a.price - b.price
      : sort === "name" ? a.name.localeCompare(b.name, "pt-BR")
        : sort === "variation" ? b.priceChange - a.priceChange
          : sort === "lastRound" ? b.roundPoints - a.roundPoints
            : b.totalPoints - a.totalPoints), [market, query, sort]);
  const scheduledAt = round?.date && round.start_time ? new Date(`${round.date}T${round.start_time}`).getTime() : null;
  const countdown = scheduledAt ? scheduledAt - now : null;
  const selectedChallengePlayer = market.find((player) => player.id === challengeId) || null;
  const challengeOffer = challengeType && selectedChallengePlayer
    ? fantasyChallengeOffer(challengeType, selectedChallengePlayer.price, market.map((player) => player.price), settings)
    : null;
  const currentSignature = JSON.stringify({ ids: selected, captain: captainId, scorer: scorerId, assist: assistId, challenge: challengeId });
  const complete = selected.length === 5 && Boolean(captainId) && remaining >= 0;
  const saveState = !open ? "Mercado fechado" : savedSignature === currentSignature ? betweenRounds ? "Elenco salvo" : "Escalação salva" : complete ? "Pronta para salvar" : "Escalação incompleta";

  useEffect(() => {
    if (status !== "in_progress" || !round) return;
    const channel = supabase.channel(`fantasy-${round.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "match_events" }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "player_round_stats", filter: `round_id=eq.${round.id}` }, () => router.refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [round, router, status]);

  useEffect(() => {
    const channel = supabase
      .channel(`fantasy-market-players-${round?.id || "analysis"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "players" }, () => router.refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [round?.id, router]);

  useEffect(() => {
    if (!open || betweenRounds || !scheduledAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [betweenRounds, open, scheduledAt]);

  function togglePlayer(player: FantasyMarketPlayer) {
    if (!open) return;
    if (selected.includes(player.id)) {
      setSelected((current) => current.filter((id) => id !== player.id));
      if (captainId === player.id) setCaptainId(null);
      return;
    }
    if (selected.length >= 5) return setMessage("Sua escalação já tem cinco jogadores.");
    if (player.price > remaining) return setMessage("Patrimônio insuficiente para comprar este jogador.");
    setSelected((current) => [...current, player.id]); setMessage("");
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
        setMessage(result.success
          ? betweenRounds ? "Elenco permanente salvo para a próxima Ranked!" : selected.length === 5 && captainId ? "Escalação salva e pronta!" : "Rascunho salvo. Complete antes do primeiro jogo."
          : result.error || "Não foi possível salvar.");
        if (result.success) setSavedSignature(currentSignature);
      } catch {
        setMessage("A conexão falhou ao salvar. Sua tela foi mantida; tente novamente.");
      }
    });
  }

  return (
    <div className="relative left-1/2 w-[calc(100vw-2rem)] max-w-7xl -translate-x-1/2 space-y-5">
      {isTest && (
        <div className="overflow-hidden rounded-2xl border border-warning/45 bg-warning/12 p-4 text-center shadow-[0_0_28px_rgba(245,158,11,.08)]">
          <p className="text-[10px] font-black uppercase tracking-[.22em] text-warning">Modo teste · amistoso</p>
          <p className="mt-1 text-xs font-bold leading-5 text-foreground">Esta simulação não altera ranking, preços, patrimônio nem o histórico oficial do Cartola.</p>
        </div>
      )}
      {betweenRounds && (
        <div className="overflow-hidden rounded-2xl border border-accent/35 bg-accent/10 p-4">
          <p className="text-[10px] font-black uppercase tracking-[.22em] text-accent">Mercado permanente</p>
          <p className="mt-1 text-xs font-bold leading-5 text-foreground">Compre, venda e escolha seu capitão agora. O elenco será levado para a próxima Ranked.</p>
        </div>
      )}
      <header className="overflow-hidden rounded-3xl border border-accent/25 bg-[radial-gradient(circle_at_85%_15%,rgba(204,255,0,.2),transparent_28%),linear-gradient(135deg,rgba(204,255,0,.10),rgba(4,24,14,.95)_48%)] p-5">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-[10px] font-black uppercase tracking-[.22em] text-accent">Fantasy da Pelada</p><h1 className="mt-1 text-2xl font-black italic text-foreground">CARTOLA</h1><p className="mt-1 text-xs text-muted">{betweenRounds ? "Prepare seu elenco para a próxima Ranked" : `Ranked ${round?.number || ""} · escale cinco craques`}</p></div>
          <span className={`rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-wider ${isTest ? "bg-warning/15 text-warning" : open ? "bg-accent/15 text-accent" : status === "in_progress" ? "bg-warning/15 text-warning" : "bg-surface text-muted"}`}>{isTest ? `Teste · ${open ? "aberto" : status === "in_progress" ? "em jogo" : "finalizado"}` : betweenRounds ? "Compras abertas" : open ? "Mercado aberto" : status === "in_progress" ? "Em andamento" : "Finalizado"}</span>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2">
          <Metric label="Patrimônio" value={formatFantasyMoney(budget, settings.currencyName)} />
          <Metric label={betweenRounds ? "Pontos" : "Escalação"} value={betweenRounds ? account.totalPoints.toFixed(1) : formatFantasyMoney(cost, settings.currencyName)} />
          <Metric label={betweenRounds ? "Melhor rodada" : "Restante"} value={betweenRounds ? `${account.bestRoundPoints.toFixed(1)} pts` : formatFantasyMoney(remaining, settings.currencyName)} accent={betweenRounds || remaining >= 0} />
        </div>
      </header>

      {!betweenRounds && round && (
        <section className={`flex items-center gap-3 rounded-2xl border p-4 ${open ? "border-accent/35 bg-accent/10" : "border-border bg-surface"}`}>
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${open ? "bg-accent/15 text-accent" : "bg-white/5 text-muted"}`}>
            {open ? <Clock className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-black uppercase tracking-[.16em] text-muted">{open ? "Mercado aberto" : "Mercado fechado"}</p>
            <p className="mt-0.5 text-sm font-black text-foreground">
              {open && countdown != null && countdown > 0 ? `Horário previsto em ${formatCountdown(countdown)}` : open && countdown != null ? "Horário previsto atingido · aguardando início" : open ? "Fecha quando a primeira partida começar" : "Sua escalação está bloqueada nesta rodada"}
            </p>
          </div>
        </section>
      )}

      {!isTest && (insights.topRoundPlayer || insights.mostSelectedPlayer || insights.topValuationPlayer || insights.topDepreciationPlayer) && (
        <section className="space-y-3">
          <div><h2 className="text-sm font-black uppercase text-foreground">Radar da última Ranked</h2><p className="text-[10px] text-muted">Quem pontuou, apareceu nas escalações e movimentou o mercado</p></div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <InsightCard label="Craque da rodada" player={insights.topRoundPlayer} value={insights.topRoundPlayer ? `${insights.topRoundPlayer.roundPoints.toFixed(1)} pts` : "—"} />
            <InsightCard label="Mais escalado" player={insights.mostSelectedPlayer} value={insights.mostSelectedPlayer ? `${insights.mostSelectedPlayer.selectionCount} time${insights.mostSelectedPlayer.selectionCount === 1 ? "" : "s"}` : "—"} />
            <InsightCard label="Maior valorização" player={insights.topValuationPlayer} value={insights.topValuationPlayer ? formatSignedMoney(insights.topValuationPlayer.priceChange, settings) : "—"} positive />
            <InsightCard label="Maior queda" player={insights.topDepreciationPlayer} value={insights.topDepreciationPlayer ? formatSignedMoney(insights.topDepreciationPlayer.priceChange, settings) : "—"} />
          </div>
        </section>
      )}

      {lastRound && !isTest && (
        <section className="overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div><p className="text-[9px] font-black uppercase tracking-[.18em] text-muted">Última rodada</p><p className="mt-0.5 text-sm font-black text-foreground">Ranked {String(lastRound.number).padStart(2, "0")}</p></div>
            <strong className="text-2xl font-black text-accent">{lastRound.totalPoints.toFixed(1)} pts</strong>
          </div>
          <div className="grid grid-cols-2 gap-px bg-border">
            <Metric label="Jogadores" value={`${lastRound.playerPoints.toFixed(1)} pts`} />
            <Metric label="Palpites" value={`${lastRound.predictionPoints.toFixed(1)} pts`} />
          </div>
        </section>
      )}

      <div className="flex gap-2">
        <Link className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-center text-xs font-bold text-foreground hover:border-accent/40 transition-colors" href="/cartola/ranking">
          <Trophy className="mr-1 inline h-4 w-4 text-accent" />Ranking
        </Link>
        <Link className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-center text-xs font-bold text-foreground hover:border-accent/40 transition-colors" href="/cartola/historico">
          <TrendingUp className="mr-1 inline h-4 w-4 text-accent" />Histórico
        </Link>
        <button
          type="button"
          onClick={() => setShowTutorial(true)}
          className="flex-1 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-center text-xs font-bold text-accent hover:bg-accent/20 transition-colors"
        >
          <HelpCircle className="mr-1 inline h-4 w-4" />Tutorial
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,.9fr)]">
        <section className="space-y-4">
          <div className="flex items-center justify-between"><div><h2 className="text-sm font-black uppercase text-foreground">{betweenRounds ? "Meu elenco" : "Meu time"}</h2><p className="text-[10px] text-muted">{open ? "Toque na coroa para escolher o capitão" : "Escalação somente para consulta"}</p><p className={`mt-1 text-[9px] font-black uppercase ${saveState.includes("salva") || saveState.includes("Pronta") ? "text-accent" : "text-warning"}`}>{saveState}</p></div><strong className="text-sm text-accent">{selected.length}/5</strong></div>
          <div className="relative min-h-[430px] overflow-hidden rounded-[2rem] border-2 border-emerald-400/25 bg-[linear-gradient(90deg,rgba(255,255,255,.035)_50%,transparent_50%),linear-gradient(#07552e,#064426)] bg-[length:33.333%_100%,100%_100%] p-5 shadow-inner">
            <div className="pointer-events-none absolute inset-5 rounded-2xl border border-white/35"><div className="absolute left-1/2 top-0 h-20 w-36 -translate-x-1/2 border-x border-b border-white/30"/><div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/30"/><div className="absolute bottom-0 left-1/2 h-20 w-36 -translate-x-1/2 border-x border-t border-white/30"/></div>
            <div className="relative z-10 grid min-h-[390px] grid-cols-2 content-around gap-x-5 gap-y-5 sm:grid-cols-3">
              {[0,1,2,3,4].map((slot) => { const player = selectedPlayers[slot]; return player ? (
                <div key={player.id} className={`relative mx-auto flex w-full max-w-32 flex-col items-center ${slot === 4 ? "col-span-2 sm:col-span-1" : ""}`}>
                  <button type="button" disabled={!open} onClick={() => setCaptainId(player.id)} className={`absolute -right-1 -top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border ${captainId === player.id ? "border-accent bg-accent text-background" : "border-white/20 bg-background text-muted"}`} aria-label={`Escolher ${player.name} como capitão`}><Crown className="h-4 w-4" /></button>
                  <button type="button" onClick={() => togglePlayer(player)} className="flex flex-col items-center"><PlayerAvatar name={player.name} avatarUrl={player.avatarUrl} className="h-14 w-14 rounded-full border-2 border-accent bg-background text-sm font-black text-accent"/><span className="mt-1 max-w-32 rounded-lg bg-background/95 px-2 py-1 text-center text-[10px] font-black leading-tight text-white">{player.name}</span><span className="mt-1 text-[9px] font-bold text-accent">{status === "in_progress" ? `${(player.roundPoints * (captainId === player.id ? settings.captainMultiplier : 1)).toFixed(1)} pts` : formatFantasyMoney(player.price, settings.currencyName)}</span>{betweenRounds && <span className="text-[8px] font-bold text-white/65">Última: {player.roundPoints.toFixed(1)} pts</span>}</button>
                </div>) : <div key={slot} className={`mx-auto flex h-20 w-24 items-center justify-center rounded-2xl border border-dashed border-white/25 bg-black/15 text-[10px] font-bold text-white/45 ${slot === 4 ? "col-span-2 sm:col-span-1" : ""}`}>Vaga {slot + 1}</div>; })}
            </div>
          </div>

          {!betweenRounds && <section className="glass-card space-y-4 p-4">
            <div><h2 className="text-sm font-black uppercase text-foreground">Palpites da rodada</h2><p className="mt-1 text-[10px] text-muted">Palpites vazios valem zero e não invalidam seu time.</p></div>
            
            <Select
              label={`Artilheiro (+${settings.topScorerPredictionPoints} pts)`}
              value={scorerId || ""}
              disabled={!open}
              onChange={setScorerId}
              options={market.map(p => ({ id: p.id, name: p.name }))}
              onInfoClick={() => setInfoModal({
                title: "Palpite: Artilheiro da Rodada",
                description: `Aposte no jogador que você acredita que fará o maior número de gols nesta rodada. Se ele for o artilheiro, você ganha +${settings.topScorerPredictionPoints} pontos de bônus no Cartola!`
              })}
            />

            <Select
              label={`Garçom (+${settings.topAssistPredictionPoints} pts)`}
              value={assistId || ""}
              disabled={!open}
              onChange={setAssistId}
              options={market.map(p => ({ id: p.id, name: p.name }))}
              onInfoClick={() => setInfoModal({
                title: "Palpite: Garçom da Rodada",
                description: `Aposte no jogador que você acredita que dará o maior número de assistências para gol nesta rodada. Se ele for o líder de assistências, você ganha +${settings.topAssistPredictionPoints} pontos de bônus no Cartola!`
              })}
            />

            {challengeType && <div className="rounded-2xl border border-warning/35 bg-warning/10 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-warning"/>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[.16em] text-warning">Desafio da Rodada</p>
                    <p className="text-sm font-black text-foreground">{CHALLENGE_LABELS[challengeType]}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setInfoModal({
                    title: `Desafio: ${CHALLENGE_LABELS[challengeType]}`,
                    description: challengeOffer
                      ? `Objetivo especial desta rodada. Escale o jogador para cumprir a meta "${challengeOffer.description}" e garantir +${challengeOffer.reward} pontos extras!`
                      : "Objetivo especial da rodada. Escale o jogador correto para faturar pontos extras no Cartola!"
                  })}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-warning/20 text-warning hover:bg-warning/30 transition-colors"
                  aria-label="Informações sobre o desafio da rodada"
                >
                  <HelpCircle className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-3"><Select label="Escolha o jogador" value={challengeId || ""} disabled={!open} onChange={setChallengeId} options={market.map(p => ({ id: p.id, name: p.name }))}/></div>
              {selectedChallengePlayer && challengeOffer && <div className="mt-3 rounded-xl bg-black/20 p-3 text-[10px] font-bold text-foreground">
                <p>{selectedChallengePlayer.name} · {formatFantasyMoney(selectedChallengePlayer.price, settings.currencyName)}</p>
                <p className="mt-1 text-warning">{challengeOffer.description} · +{challengeOffer.reward} pts</p>
              </div>}
            </div>}
          </section>}
          {betweenRounds && <p className="rounded-xl border border-border bg-surface p-3 text-center text-[10px] font-bold text-muted">Os palpites e o Desafio da Rodada serão liberados quando a próxima Ranked for criada.</p>}
          {open && <button onClick={save} disabled={pending || remaining < 0} className="w-full rounded-2xl bg-accent py-3.5 text-sm font-black text-background disabled:opacity-50">{pending ? "Salvando..." : betweenRounds ? "Salvar elenco para a próxima Ranked" : selected.length === 5 && captainId ? "Salvar escalação" : "Salvar rascunho"}</button>}
          {message && <p role="status" className="rounded-xl border border-border bg-surface p-3 text-center text-xs font-bold text-foreground">{message}</p>}
        </section>

        <aside className="space-y-3"><div className="flex items-end justify-between gap-2"><div><h2 className="text-sm font-black uppercase text-foreground">Mercado</h2><p className="text-[10px] text-muted">{isTest ? "Convocados do amistoso · preços fictícios" : open ? "Escolha entre todos os jogadores disponíveis" : "Consulte preços, pontos e a última valorização"}</p></div><select value={sort} onChange={e => setSort(e.target.value)} className="max-w-32 rounded-lg border border-border bg-surface px-2 py-1.5 text-[10px] font-bold text-foreground"><option value="points">Mais pontos</option><option value="lastRound">Última rodada</option><option value="variation">Valorização</option><option value="price">Menor preço</option><option value="name">Nome</option></select></div><label className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3"><Search className="h-4 w-4 text-muted"/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar jogador" className="h-11 w-full bg-transparent text-sm text-foreground outline-none"/></label><div className="space-y-2 lg:max-h-[760px] lg:overflow-y-auto lg:pr-1">{filtered.map(player => { const bought = selected.includes(player.id); return <button key={player.id} disabled={!open} onClick={() => togglePlayer(player)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition disabled:cursor-default disabled:opacity-100 ${bought ? "border-accent/60 bg-accent/10" : `border-border bg-surface ${open ? "hover:border-accent/30" : ""}`}`}><PlayerAvatar name={player.name} avatarUrl={player.avatarUrl} className="h-11 w-11 rounded-full border border-border bg-background text-xs font-black text-accent"/><div className="min-w-0 flex-1"><p className="truncate text-xs font-black text-foreground">{player.name}</p><p className="text-[9px] text-muted">{positionLabel[player.profile || ""] || "Jogador"} · {player.goals}G {player.assists}A</p><p className="mt-1 text-[10px] font-bold text-accent">{formatFantasyMoney(player.price, settings.currencyName)} <span className={player.variation >= 0 ? "text-success" : "text-danger"}>{player.variation ? `${player.variation > 0 ? "+" : ""}${(player.variation * 100).toFixed(1)}%` : "0,0%"}</span></p><p className={`text-[8px] font-bold ${player.priceChange >= 0 ? "text-success" : "text-danger"}`}>{formatSignedMoney(player.priceChange, settings)} · última: {player.roundPoints.toFixed(1)} pts</p></div><div className="text-right"><p className="text-sm font-black text-foreground">{player.totalPoints.toFixed(1)}</p><p className="text-[8px] uppercase text-muted">pontos</p><span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-black ${open ? bought ? "bg-danger/15 text-danger" : "bg-accent/15 text-accent" : "bg-white/5 text-muted"}`}>{open ? bought ? "Vender" : "Comprar" : "Analisar"}</span></div></button>; })}</div></aside>
      </div>

      {/* MODAL DE TUTORIAL */}
      <FantasyTutorialModal isOpen={showTutorial} onClose={() => setShowTutorial(false)} />

      {/* MODAL DE AJUDA DOS PALPITES */}
      {infoModal && (
        <div
          className="mobile-dialog-backdrop fixed inset-0 z-[300] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md animate-fade-in"
          onClick={() => setInfoModal(null)}
        >
          <div
            className="relative flex max-h-[90vh] w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-accent/40 bg-[#07150d] p-6 shadow-[0_0_50px_rgba(0,0,0,0.8)] animate-fade-in-up"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={infoModal.title}
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
                <HelpCircle className="h-6 w-6" />
              </div>
              <h3 className="font-athletic text-lg font-black uppercase italic tracking-wide text-foreground">
                {infoModal.title}
              </h3>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-muted">
              {infoModal.description}
            </p>

            <button
              onClick={() => setInfoModal(null)}
              className="mt-6 w-full rounded-xl bg-accent py-3 text-xs font-black uppercase tracking-wider text-background shadow-[0_0_20px_rgba(204,255,0,0.2)] transition-transform active:scale-95"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) { return <div className="rounded-xl border border-white/10 bg-black/20 p-2.5"><p className="text-[8px] font-black uppercase tracking-wider text-muted">{label}</p><p className={`mt-1 truncate text-xs font-black ${accent ? "text-accent" : "text-foreground"}`}>{value}</p></div>; }
function InsightCard({ label, player, value, positive = false }: { label: string; player: FantasyMarketPlayer | null; value: string; positive?: boolean }) { return <article className="min-w-0 rounded-2xl border border-border bg-surface p-3"><p className="truncate text-[8px] font-black uppercase tracking-[.14em] text-muted">{label}</p>{player ? <div className="mt-2 flex items-center gap-2"><PlayerAvatar name={player.name} avatarUrl={player.avatarUrl} className="h-9 w-9 shrink-0 rounded-full border border-accent/35 bg-background text-[9px] font-black text-accent"/><div className="min-w-0"><p className="truncate text-[10px] font-black text-foreground">{player.name}</p><p className={`truncate text-[10px] font-black ${positive ? "text-success" : label === "Maior queda" ? "text-danger" : "text-accent"}`}>{value}</p></div></div> : <p className="mt-3 text-xs font-bold text-muted">Sem dados</p>}</article>; }
function formatSignedMoney(value: number, settings: FantasySettings) { const formatted = formatFantasyMoney(Math.abs(value), settings.currencyName); return `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatted}`; }
function formatCountdown(value: number) { const seconds = Math.max(0, Math.floor(value / 1000)); const hours = Math.floor(seconds / 3600); const minutes = Math.floor((seconds % 3600) / 60); const rest = seconds % 60; return `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(rest).padStart(2, "0")}s`; }
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
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-muted">{label}</span>
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
      <select
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-11 w-full rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground disabled:opacity-50"
      >
        <option value="">Sem palpite</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </div>
  );
}
