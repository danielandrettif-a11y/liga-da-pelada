"use client";

import { useState, useTransition } from "react";
import { reprocessFantasyRound, updateFantasySettings } from "@/lib/actions/fantasy";

const fields = [
  ["initial_budget", "Orçamento inicial (próxima temporada)"], ["initial_player_price", "Preço inicial (próxima temporada)"],
  ["goal_points", "Pontos por gol"], ["assist_points", "Pontos por assistência"], ["win_points", "Pontos por vitória"],
  ["loss_points", "Pontos por derrota"],
  ["goalkeeper_appearance_points", "Goleiro: bônus por partida"], ["team_goal_conceded_points", "Time: pontos por gol sofrido"],
  ["captain_multiplier", "Multiplicador do capitão"], ["top_scorer_prediction_points", "Bônus artilheiro"],
  ["top_assist_prediction_points", "Bônus garçom"], ["king_of_wins_points", "Desafio: Rei das Vitórias"],
  ["mvp_prediction_points", "Desafio: Mito da Rodada"], ["bet_of_round_points", "Desafio: Aposta da Rodada"],
  ["bet_rank_band_1", "Aposta faixa 1: posição"], ["bet_rank_band_2", "Aposta faixa 2: posição"],
  ["bet_rank_band_3", "Aposta faixa 3: posição"], ["bet_rank_band_4", "Aposta faixa 4: posição"],
  ["score_goal_reward_band_1", "Vai Guardar faixa 1"], ["score_goal_reward_band_2", "Vai Guardar faixa 2"],
  ["score_goal_reward_band_3", "Vai Guardar faixa 3"], ["score_goal_reward_band_4", "Vai Guardar faixa 4"],
  ["min_player_price", "Preço mínimo"], ["max_player_price", "Preço máximo"], ["smoothing_games", "Jogos de suavização"],
  ["recent_weight", "Peso desempenho recente"], ["win_rate_weight", "Peso aproveitamento"],
  ["historical_weight", "Peso histórico"], ["consistency_weight", "Peso consistência"],
  ["max_price_increase", "Valorização máxima (decimal)"], ["max_price_decrease", "Desvalorização máxima (decimal)"],
] as const;

export function FantasyAdminSettings({ settings, rounds }: { settings: any; rounds: any[] }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map(([key]) => [key, String(settings?.[key] ?? "")])));
  const [message, setMessage] = useState(""); const [pending, startTransition] = useTransition();
  function save() { startTransition(async () => { const raw = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number(value)])); const payload = { ...raw, lossPoints: raw.loss_points, goalkeeperAppearancePoints: raw.goalkeeper_appearance_points, teamGoalConcededPoints: raw.team_goal_conceded_points }; delete (payload as any).loss_points; delete (payload as any).goalkeeper_appearance_points; delete (payload as any).team_goal_conceded_points; const result = await updateFantasySettings(payload as any); setMessage(result.success ? "Configurações salvas para as próximas rodadas." : result.error || "Erro ao salvar."); }); }
  function reprocess(roundId: string) { if (!confirm("Reprocessar esta rodada e todas as posteriores?")) return; startTransition(async () => { const result = await reprocessFantasyRound(roundId); setMessage(result.success ? "Cartola reprocessado com auditoria." : result.error || "Erro ao reprocessar."); }); }
  return <div className="space-y-6"><section className="glass-card p-4"><div className="mb-4 rounded-xl border border-accent/20 bg-accent/5 p-3"><p className="text-xs font-black text-accent">Mercado V2 · 30/30/40</p><p className="mt-1 text-[10px] leading-relaxed text-muted">Os 30% melhores valorizam de +3% a +12%; os 30% seguintes ficam estáveis; os 40% finais desvalorizam de -2% a -10%. Empates recebem o mesmo tratamento.</p></div><div className="grid gap-3 sm:grid-cols-2">{fields.map(([key, label]) => <label key={key}><span className="mb-1 block text-[10px] font-bold text-muted">{label}</span><input type="number" step="0.01" value={values[key]} onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-bold text-foreground"/></label>)}</div><button onClick={save} disabled={pending} className="mt-4 w-full rounded-xl bg-accent py-3 text-sm font-black text-background disabled:opacity-50">Salvar regras futuras</button><p className="mt-2 text-[10px] text-muted">As alterações valem somente para rodadas abertas depois de salvar. Rodadas antigas usam o snapshot original.</p></section><section><h2 className="mb-2 text-xs font-black uppercase text-muted">Reprocessamento</h2><div className="space-y-2">{rounds.map((item: any) => <div key={item.id} className="glass-card flex items-center justify-between gap-3 p-4"><div><p className="text-sm font-black text-foreground">Rodada {item.round?.number}</p><p className="text-[10px] text-muted">{item.round?.date} · {item.market_status}</p></div><button disabled={pending || item.round?.status !== "finished"} onClick={() => reprocess(item.round?.id)} className="rounded-lg border border-warning/30 px-3 py-2 text-[10px] font-black text-warning disabled:opacity-30">Reprocessar desde aqui</button></div>)}</div></section>{message && <p role="status" className="rounded-xl border border-border bg-surface p-3 text-xs font-bold text-foreground">{message}</p>}</div>;
}
