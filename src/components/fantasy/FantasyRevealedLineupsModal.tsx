"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Crown, Lock, Search, Target, Trophy, X } from "@/components/icons";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { getRevealedLineups } from "@/lib/actions/fantasy";

type Props = {
  roundId?: string | null;
  roundNumber?: number | null;
  isOpen: boolean;
  onClose: () => void;
};

export function FantasyRevealedLineupsModal({
  roundId,
  roundNumber,
  isOpen,
  onClose,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{
    allowed: boolean;
    isMarketOpen?: boolean;
    error?: string;
    lineups: any[];
  } | null>(null);
  const [search, setSearch] = useState("");
  const [expandedLineupId, setExpandedLineupId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      getRevealedLineups(roundId || undefined)
        .then((res) => setData(res))
        .catch((err) =>
          setData({
            allowed: false,
            error: "Não foi possível carregar as escalações.",
            lineups: [],
          })
        )
        .finally(() => setLoading(false));
    } else {
      setData(null);
      setSearch("");
      setExpandedLineupId(null);
    }
  }, [isOpen, roundId]);

  if (!mounted || !isOpen) return null;

  const filteredLineups = (data?.lineups || []).filter((l) =>
    l.userName.toLowerCase().includes(search.toLowerCase())
  );

  return createPortal(
    <div
      className="mobile-dialog-backdrop z-[99999] bg-black/85 backdrop-blur-md animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Escalações Reveladas da Rodada"
    >
      <div
        className="relative flex w-full max-w-2xl max-h-[85vh] flex-col overflow-hidden rounded-[2.5rem] border border-accent/40 bg-[#06160d] shadow-[0_0_60px_rgba(0,0,0,0.95)] animate-fade-in-up my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 p-5 sm:p-6 bg-surface/50">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent/20 text-accent">
              <Trophy className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black uppercase text-foreground">
                  Escalações Reveladas
                </h2>
                <span className="rounded-full bg-success/20 text-success border border-success/30 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider">
                  🔓 Público
                </span>
              </div>
              <p className="text-xs text-muted">
                {roundNumber ? `Ranked ${String(roundNumber).padStart(2, "0")}` : "Rodada atual"} · Veja o time dos seus rivais
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Campo de Busca */}
        <div className="border-b border-white/5 p-4 bg-black/20">
          <label className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3">
            <Search className="h-4 w-4 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por cartoleiro..."
              className="h-10 w-full bg-transparent text-xs font-bold text-foreground outline-none"
            />
          </label>
        </div>

        {/* Conteúdo das Escalações */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 touch-auto overscroll-contain">
          {loading ? (
            <div className="py-12 text-center text-sm font-bold text-muted animate-pulse">
              Carregando escalações reveladas...
            </div>
          ) : data && !data.allowed ? (
            <div className="rounded-2xl border border-warning/30 bg-warning/10 p-6 text-center space-y-2">
              <Lock className="mx-auto h-8 w-8 text-warning" />
              <h3 className="text-sm font-black text-foreground">Mercado Ainda Aberto</h3>
              <p className="text-xs text-muted max-w-sm mx-auto">
                {data.error || "As escalações individuais só são reveladas para todos após o fechamento do mercado."}
              </p>
            </div>
          ) : filteredLineups.length === 0 ? (
            <div className="py-12 text-center text-sm font-bold text-muted">
              Nenhuma escalação encontrada.
            </div>
          ) : (
            filteredLineups.map((lineup) => {
              const expanded = expandedLineupId === lineup.lineupId;
              return <article
                key={lineup.lineupId}
                className={`rounded-2xl border p-4 transition-colors ${
                  lineup.isCurrentUser
                    ? "border-accent/50 bg-accent/10 shadow-[0_0_20px_rgba(204,255,0,0.08)]"
                    : "border-white/10 bg-surface/60"
                }`}
              >
                {/* Header do Cartoleiro: toque para abrir o resultado completo. */}
                <button
                  type="button"
                  onClick={() => setExpandedLineupId(expanded ? null : lineup.lineupId)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                  aria-expanded={expanded}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <PlayerAvatar
                      name={lineup.userName}
                      avatarUrl={lineup.userAvatarUrl}
                      clickable={false}
                      className="h-10 w-10 shrink-0 rounded-full border border-accent/40 bg-background text-xs font-black text-accent"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-black text-foreground">
                          {lineup.userName}
                        </p>
                        {lineup.isCurrentUser && (
                          <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[8px] font-black uppercase text-accent">
                            Você
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted">
                        {lineup.players.length} jogadores escalados
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-right shrink-0">
                    <span className="text-xs font-black text-muted">{expanded ? "−" : "+"}</span>
                    <div>
                    <span className="text-base font-black text-accent">
                      {lineup.totalPoints.toFixed(1)}
                    </span>
                    <span className="block text-[8px] font-black uppercase text-muted">pts</span>
                    </div>
                  </div>
                </button>

                {expanded && <>
                {/* 5 Jogadores Escalados */}
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2 border-t border-white/5 pt-3">
                  {lineup.players.map((p: any) => (
                    <div
                      key={p.playerId}
                      className={`relative flex flex-col items-center rounded-xl border p-2 text-center ${
                        p.isCaptain
                          ? "border-warning/60 bg-warning/10 ring-1 ring-warning/30"
                          : "border-white/5 bg-black/20"
                      }`}
                    >
                      {p.isCaptain && (
                        <span
                          className="absolute -top-1.5 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-warning text-background shadow"
                          title="Capitão (2x Pontos)"
                        >
                          <Crown className="h-3 w-3" />
                        </span>
                      )}
                      <PlayerAvatar
                        name={p.name}
                        avatarUrl={p.avatarUrl}
                        clickable={false}
                        className="h-9 w-9 rounded-full border border-white/20 bg-background text-[10px] font-black text-accent"
                      />
                      <span className="mt-1 truncate w-full text-[10px] font-black text-foreground">
                        {p.name}
                      </span>
                      <span className="text-[9px] font-bold text-accent">
                        {p.points.toFixed(1)} pts
                      </span>
                      <span className="mt-0.5 text-[8px] text-muted">
                        Base {(p.basePoints - (p.positionBonus || 0)).toFixed(1)} · posição {(p.positionBonus || 0).toFixed(1)}{p.captainBonus ? ` · capitão ${p.captainBonus.toFixed(1)}` : ""}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Desafio da rodada */}
                {lineup.challengePlayer && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/5 pt-2 text-[9px] font-bold text-muted">
                    <span className="rounded-lg bg-warning/10 text-warning px-2 py-1 flex items-center gap-1 border border-warning/20">
                      <Target className="h-3 w-3 inline" /> Desafio: <strong>{lineup.challengePlayer.name}</strong>
                    </span>
                  </div>
                )}
                {lineup.activeCard && (
                  <div className="mt-3 rounded-xl border border-[#a65cff]/35 bg-[#a65cff]/10 px-3 py-2 text-[10px]">
                    <p className="font-black text-[#d7adff]">🃏 Carta: {lineup.activeCard.name} <span className="text-muted">· {lineup.activeCard.status}</span></p>
                    <p className="mt-1 text-muted">Bônus da carta: <strong className="text-foreground">{lineup.activeCard.bonus >= 0 ? "+" : ""}{lineup.activeCard.bonus.toFixed(1)} pts</strong></p>
                  </div>
                )}
                <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-black/20 p-2 text-center text-[9px]">
                  <span><strong className="block text-foreground">{lineup.playerPoints.toFixed(1)}</strong>jogadores</span>
                  <span><strong className="block text-accent">{lineup.totalPoints.toFixed(1)}</strong>total</span>
                </div>
                </>}
              </article>
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
