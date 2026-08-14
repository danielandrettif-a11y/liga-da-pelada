"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Crown, Search, TrendingUp, Trophy } from "@/components/icons";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { formatFantasyMoney, type FantasySettings } from "@/lib/fantasy/config";
import { saveFantasyLineup, type FantasyMarketPlayer } from "@/lib/actions/fantasy";
import { supabase } from "@/lib/supabase";

type Props = {
  round: { id: string; number: number; date: string; start_time: string | null; teams?: { id: string; name: string; color: string }[] };
  status: string;
  settings: FantasySettings;
  market: FantasyMarketPlayer[];
  budget: number;
  lineup: any;
  isTest?: boolean;
};

const positionLabel: Record<string, string> = { defensive: "Defesa", midfield: "Meio", offensive: "Ataque" };

export function FantasyExperience({ round, status, settings, market, budget, lineup, isTest = false }: Props) {
  const router = useRouter();
  const initialIds = (lineup?.fantasy_lineup_players || []).map((item: any) => item.player_id as string);
  const [selected, setSelected] = useState<string[]>(initialIds);
  const [captainId, setCaptainId] = useState<string | null>(lineup?.captain_player_id || null);
  const [scorerId, setScorerId] = useState<string | null>(lineup?.top_scorer_player_id || null);
  const [assistId, setAssistId] = useState<string | null>(lineup?.top_assist_player_id || null);
  const [teamId, setTeamId] = useState<string | null>(lineup?.top_team_id || null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("points");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const open = status === "open";
  const selectedPlayers = selected.map((id) => market.find((player) => player.id === id)).filter(Boolean) as FantasyMarketPlayer[];
  const cost = selectedPlayers.reduce((sum, player) => sum + player.price, 0);
  const remaining = budget - cost;
  const filtered = useMemo(() => [...market]
    .filter((player) => player.name.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")))
    .sort((a, b) => sort === "price" ? a.price - b.price : sort === "name" ? a.name.localeCompare(b.name, "pt-BR") : b.totalPoints - a.totalPoints), [market, query, sort]);

  useEffect(() => {
    if (status !== "in_progress") return;
    const channel = supabase.channel(`fantasy-${round.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "match_events" }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "player_round_stats", filter: `round_id=eq.${round.id}` }, () => router.refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [round.id, router, status]);

  useEffect(() => {
    if (!open) return;
    const channel = supabase
      .channel(`fantasy-market-players-${round.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "players" }, () => router.refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [open, round.id, router]);

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
        const result = await saveFantasyLineup({ roundId: round.id, playerIds: selected, captainId, scorerId, assistId, teamId });
        setMessage(result.success ? (selected.length === 5 && captainId ? "Escalação salva e pronta!" : "Rascunho salvo. Complete antes do primeiro jogo.") : result.error || "Não foi possível salvar.");
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
      <header className="overflow-hidden rounded-3xl border border-accent/25 bg-[radial-gradient(circle_at_85%_15%,rgba(204,255,0,.2),transparent_28%),linear-gradient(135deg,rgba(204,255,0,.10),rgba(4,24,14,.95)_48%)] p-5">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-[10px] font-black uppercase tracking-[.22em] text-accent">Fantasy da Pelada</p><h1 className="mt-1 text-2xl font-black italic text-foreground">CARTOLA</h1><p className="mt-1 text-xs text-muted">Rodada {round.number} · escale cinco craques</p></div>
          <span className={`rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-wider ${isTest ? "bg-warning/15 text-warning" : open ? "bg-accent/15 text-accent" : status === "in_progress" ? "bg-warning/15 text-warning" : "bg-surface text-muted"}`}>{isTest ? `Teste · ${open ? "aberto" : status === "in_progress" ? "em jogo" : "finalizado"}` : open ? "Mercado aberto" : status === "in_progress" ? "Em andamento" : "Finalizado"}</span>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2">
          <Metric label="Patrimônio" value={formatFantasyMoney(budget, settings.currencyName)} />
          <Metric label="Escalação" value={formatFantasyMoney(cost, settings.currencyName)} />
          <Metric label="Restante" value={formatFantasyMoney(remaining, settings.currencyName)} accent={remaining >= 0} />
        </div>
      </header>

      <div className="flex gap-2"><Link className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-center text-xs font-bold text-foreground" href="/cartola/ranking"><Trophy className="mr-1 inline h-4 w-4 text-accent" />Ranking</Link><Link className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-center text-xs font-bold text-foreground" href="/cartola/historico"><TrendingUp className="mr-1 inline h-4 w-4 text-accent" />Histórico</Link></div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,.9fr)]">
        <section className="space-y-4">
          <div className="flex items-center justify-between"><div><h2 className="text-sm font-black uppercase text-foreground">Meu time</h2><p className="text-[10px] text-muted">Toque na coroa para escolher o capitão</p></div><strong className="text-sm text-accent">{selected.length}/5</strong></div>
          <div className="relative min-h-[430px] overflow-hidden rounded-[2rem] border-2 border-emerald-400/25 bg-[linear-gradient(90deg,rgba(255,255,255,.035)_50%,transparent_50%),linear-gradient(#07552e,#064426)] bg-[length:33.333%_100%,100%_100%] p-5 shadow-inner">
            <div className="pointer-events-none absolute inset-5 rounded-2xl border border-white/35"><div className="absolute left-1/2 top-0 h-20 w-36 -translate-x-1/2 border-x border-b border-white/30"/><div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/30"/><div className="absolute bottom-0 left-1/2 h-20 w-36 -translate-x-1/2 border-x border-t border-white/30"/></div>
            <div className="relative z-10 grid min-h-[390px] grid-cols-2 content-around gap-x-5 gap-y-5 sm:grid-cols-3">
              {[0,1,2,3,4].map((slot) => { const player = selectedPlayers[slot]; return player ? (
                <div key={player.id} className={`relative mx-auto flex w-full max-w-32 flex-col items-center ${slot === 4 ? "col-span-2 sm:col-span-1" : ""}`}>
                  <button type="button" disabled={!open} onClick={() => setCaptainId(player.id)} className={`absolute -right-1 -top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border ${captainId === player.id ? "border-accent bg-accent text-background" : "border-white/20 bg-background text-muted"}`} aria-label={`Escolher ${player.name} como capitão`}><Crown className="h-4 w-4" /></button>
                  <button type="button" onClick={() => togglePlayer(player)} className="flex flex-col items-center"><PlayerAvatar name={player.name} avatarUrl={player.avatarUrl} className="h-14 w-14 rounded-full border-2 border-accent bg-background text-sm font-black text-accent"/><span className="mt-1 max-w-32 rounded-lg bg-background/95 px-2 py-1 text-center text-[10px] font-black leading-tight text-white">{player.name}</span><span className="mt-1 text-[9px] font-bold text-accent">{status === "in_progress" ? `${(player.roundPoints * (captainId === player.id ? settings.captainMultiplier : 1)).toFixed(1)} pts` : formatFantasyMoney(player.price, settings.currencyName)}</span></button>
                </div>) : <div key={slot} className={`mx-auto flex h-20 w-24 items-center justify-center rounded-2xl border border-dashed border-white/25 bg-black/15 text-[10px] font-bold text-white/45 ${slot === 4 ? "col-span-2 sm:col-span-1" : ""}`}>Vaga {slot + 1}</div>; })}
            </div>
          </div>

          <section className="glass-card space-y-3 p-4"><h2 className="text-sm font-black uppercase text-foreground">Palpites da rodada</h2><Select label={`Artilheiro (+${settings.topScorerPredictionPoints})`} value={scorerId || ""} disabled={!open} onChange={setScorerId} options={market.map(p => ({ id: p.id, name: p.name }))}/><Select label={`Garçom (+${settings.topAssistPredictionPoints})`} value={assistId || ""} disabled={!open} onChange={setAssistId} options={market.map(p => ({ id: p.id, name: p.name }))}/><Select label={`Time com mais vitórias (+${settings.topTeamPredictionPoints})`} value={teamId || ""} disabled={!open || !round.teams?.length} onChange={setTeamId} options={(round.teams || []).map(t => ({ id: t.id, name: t.name }))}/>{!round.teams?.length && <p className="text-[10px] text-warning">Este palpite será liberado quando os times reais forem montados.</p>}</section>
          {open && <button onClick={save} disabled={pending || remaining < 0} className="w-full rounded-2xl bg-accent py-3.5 text-sm font-black text-background disabled:opacity-50">{pending ? "Salvando..." : selected.length === 5 && captainId ? "Salvar escalação" : "Salvar rascunho"}</button>}
          {message && <p role="status" className="rounded-xl border border-border bg-surface p-3 text-center text-xs font-bold text-foreground">{message}</p>}
        </section>

        <aside className="space-y-3"><div className="flex items-end justify-between"><div><h2 className="text-sm font-black uppercase text-foreground">Mercado</h2><p className="text-[10px] text-muted">{isTest ? "Convocados do amistoso · preços fictícios" : "Preço e desempenho da temporada"}</p></div><select value={sort} onChange={e => setSort(e.target.value)} className="rounded-lg border border-border bg-surface px-2 py-1.5 text-[10px] font-bold text-foreground"><option value="points">Mais pontos</option><option value="price">Menor preço</option><option value="name">Nome</option></select></div><label className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3"><Search className="h-4 w-4 text-muted"/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar jogador" className="h-11 w-full bg-transparent text-sm text-foreground outline-none"/></label><div className="space-y-2 lg:max-h-[760px] lg:overflow-y-auto lg:pr-1">{filtered.map(player => { const bought = selected.includes(player.id); return <button key={player.id} disabled={!open} onClick={() => togglePlayer(player)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${bought ? "border-accent/60 bg-accent/10" : "border-border bg-surface hover:border-accent/30"}`}><PlayerAvatar name={player.name} avatarUrl={player.avatarUrl} className="h-11 w-11 rounded-full border border-border bg-background text-xs font-black text-accent"/><div className="min-w-0 flex-1"><p className="truncate text-xs font-black text-foreground">{player.name}</p><p className="text-[9px] text-muted">{positionLabel[player.profile || ""] || "Jogador"} · {player.goals}G {player.assists}A</p><p className="mt-1 text-[10px] font-bold text-accent">{formatFantasyMoney(player.price, settings.currencyName)} <span className={player.variation >= 0 ? "text-success" : "text-danger"}>{player.variation ? `${player.variation > 0 ? "+" : ""}${(player.variation * 100).toFixed(1)}%` : ""}</span></p></div><div className="text-right"><p className="text-sm font-black text-foreground">{player.totalPoints.toFixed(1)}</p><p className="text-[8px] uppercase text-muted">pontos</p><span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-black ${bought ? "bg-danger/15 text-danger" : "bg-accent/15 text-accent"}`}>{bought ? "Vender" : "Comprar"}</span></div></button>; })}</div></aside>
      </div>
    </div>
  );
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) { return <div className="rounded-xl border border-white/10 bg-black/20 p-2.5"><p className="text-[8px] font-black uppercase tracking-wider text-muted">{label}</p><p className={`mt-1 truncate text-xs font-black ${accent ? "text-accent" : "text-foreground"}`}>{value}</p></div>; }
function Select({ label, value, disabled, onChange, options }: { label: string; value: string; disabled: boolean; onChange: (value: string | null) => void; options: { id: string; name: string }[] }) { return <label className="block"><span className="mb-1 block text-[10px] font-bold text-muted">{label}</span><select disabled={disabled} value={value} onChange={e => onChange(e.target.value || null)} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground disabled:opacity-50"><option value="">Sem palpite</option>{options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>; }
