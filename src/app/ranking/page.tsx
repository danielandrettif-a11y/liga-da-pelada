import { Trophy, Medal, Flame, Search, SlidersHorizontal, ChevronRight } from "lucide-react";
import Link from "next/link";
import { getRanking } from "@/lib/actions/stats";
import { getInitials } from "@/lib/utils";

export const revalidate = 0;

export default async function RankingPage() {
  const ranking = await getRanking();
  
  // Pegar os 3 primeiros para o pódio se houver
  const podium = ranking.slice(0, 3);

  // Ordenação do pódio (2, 1, 3) para visual
  const podiumVisualOrder = podium.length === 3 ? [podium[1], podium[0], podium[2]] : podium;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Ranking Geral</h1>
          <p className="text-xs text-muted mt-0.5">Temporada 2026</p>
        </div>
        <button className="w-10 h-10 rounded-full bg-surface hover:bg-surface-hover flex items-center justify-center transition-colors">
          <SlidersHorizontal className="w-5 h-5 text-muted" />
        </button>
      </div>

      {ranking.length === 0 ? (
        <div className="glass-card p-10 text-center flex flex-col items-center justify-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-surface flex items-center justify-center text-3xl">😢</div>
          <h2 className="font-bold text-foreground">Nenhum dado ainda!</h2>
          <p className="text-sm text-muted">Jogue e encerre partidas para começar a pontuar no ranking.</p>
        </div>
      ) : (
        <>
          {/* Pódio (Apenas se tiver ao menos 3) */}
          {podium.length >= 3 && (
            <div className="pt-8 pb-4 flex items-end justify-center gap-2 sm:gap-4 animate-fade-in">
              {podiumVisualOrder.map((playerStat, index) => {
                const position = index === 0 ? 2 : index === 1 ? 1 : 3;
                const isFirst = position === 1;
                
                const height = isFirst ? "h-32" : position === 2 ? "h-24" : "h-20";
                const bg = isFirst 
                  ? "bg-gradient-to-t from-accent/40 to-accent/10 border-accent/50" 
                  : position === 2 
                    ? "bg-gradient-to-t from-zinc-400/30 to-zinc-400/5 border-zinc-400/30"
                    : "bg-gradient-to-t from-amber-700/30 to-amber-700/5 border-amber-700/30";
                
                const medalColor = isFirst ? "text-yellow-400" : position === 2 ? "text-zinc-400" : "text-amber-600";

                return (
                  <div key={playerStat.player.id} className={`relative flex flex-col items-center w-1/3 max-w-[100px] animate-slide-in-bottom stagger-${position}`}>
                    
                    {/* Avatar & Medalha */}
                    <div className={`relative mb-2 ${isFirst ? '-mt-4' : ''}`}>
                      <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-sm font-bold shadow-xl border-2 z-10 relative bg-background ${isFirst ? 'border-accent text-accent' : 'border-border text-muted'}`}>
                        {getInitials(playerStat.player.name)}
                      </div>
                      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 z-20">
                        <Medal className={`w-6 h-6 drop-shadow-md ${medalColor} ${isFirst ? 'scale-125' : ''}`} fill="currentColor" />
                      </div>
                    </div>

                    {/* Nome & Pontos */}
                    <div className="text-center mb-2 px-1">
                      <p className="text-[10px] sm:text-xs font-bold text-foreground truncate w-full">
                        {playerStat.player.nickname || playerStat.player.name}
                      </p>
                      <p className={`text-xs font-black ${isFirst ? 'text-accent' : 'text-muted'}`}>
                        {playerStat.points} <span className="text-[8px] uppercase tracking-wider font-semibold opacity-70">pts</span>
                      </p>
                    </div>

                    {/* Base do Pódio */}
                    <div className={`w-full ${height} ${bg} rounded-t-xl border-t border-l border-r backdrop-blur-sm flex justify-center pt-2`}>
                      <span className="text-xl sm:text-2xl font-black text-foreground/20">{position}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Resto da Lista */}
          <div className="space-y-2 pb-20">
            {ranking.map((playerStat, index) => {
              // Pular o pódio
              if (index < 3 && ranking.length >= 3) return null;

              return (
                <Link key={playerStat.player.id} href={`/jogadores/${playerStat.player.id}`} className="block">
                  <div className="glass-card glass-card-hover p-3 flex items-center gap-3 animate-fade-in stagger-3">
                    
                    {/* Posição */}
                    <div className="w-8 flex justify-center text-sm font-bold text-muted">
                      {index + 1}º
                    </div>

                    {/* Info */}
                    <div className="flex-1 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center text-xs font-bold text-foreground border border-border">
                          {getInitials(playerStat.player.name)}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-foreground">{playerStat.player.nickname || playerStat.player.name}</p>
                          <div className="flex gap-2 text-[10px] text-muted">
                            <span>V: {playerStat.wins}</span>
                            <span>G: {playerStat.goals}</span>
                            <span>A: {playerStat.assists}</span>
                          </div>
                        </div>
                      </div>

                      {/* Pontos */}
                      <div className="text-right">
                        <p className="stat-number text-xl text-foreground">{playerStat.points}</p>
                        <p className="text-[9px] uppercase tracking-wider font-bold text-muted">pts</p>
                      </div>
                    </div>

                    <ChevronRight className="w-4 h-4 text-muted/50" />
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
