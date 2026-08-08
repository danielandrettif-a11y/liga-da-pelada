import { CalendarDays, ChevronRight, TrendingUp } from "lucide-react";
import Link from "next/link";

// Dados mock para demonstrar o layout (serão substituídos por dados do Supabase)
const MOCK_HIGHLIGHTS = {
  nextRound: { number: 3, date: "08/08/2026", confirmed: 15 },
  lastRound: { number: 2, date: "01/08/2026" },
  topScorer: { name: "Daniel", nickname: "Daniel", goals: 5 },
  topAssists: { name: "JP", nickname: "JP", assists: 3 },
  topWins: { name: "Daniel", nickname: "Daniel", wins: 4 },
};

const MOCK_RANKING = [
  { rank: 1, name: "Daniel", points: 27, goals: 5, assists: 2 },
  { rank: 2, name: "Gabigol", points: 15, goals: 4, assists: 0 },
  { rank: 3, name: "Luquinha", points: 16, goals: 2, assists: 1 },
  { rank: 4, name: "JP", points: 12, goals: 2, assists: 3 },
  { rank: 5, name: "Dedé", points: 11, goals: 2, assists: 1 },
];

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    const cls = rank === 1 ? "rank-1" : rank === 2 ? "rank-2" : "rank-3";
    return <span className={`rank-badge ${cls}`}>{rank}</span>;
  }
  return (
    <span className="rank-badge bg-surface text-muted">{rank}</span>
  );
}

function StatHighlightCard({
  emoji,
  label,
  playerName,
  value,
  unit,
  delay,
}: {
  emoji: string;
  label: string;
  playerName: string;
  value: number;
  unit: string;
  delay: string;
}) {
  return (
    <div className={`glass-card p-4 animate-fade-in-up ${delay}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{emoji}</span>
        <span className="text-xs font-semibold text-muted uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="text-base font-bold text-foreground truncate">{playerName}</p>
      <div className="flex items-baseline gap-1 mt-1">
        <span className="stat-number text-2xl gradient-text">{value}</span>
        <span className="text-xs text-muted font-medium">{unit}</span>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="space-y-6">
      {/* Next Round Card */}
      <Link href="/rodadas" className="block">
        <div className="glass-card glass-card-hover p-5 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
                <CalendarDays className="w-5 h-5 text-accent" />
              </div>
              <div>
                <p className="text-xs text-muted font-semibold uppercase tracking-wider">
                  Próxima Pelada
                </p>
                <p className="text-lg font-bold text-foreground">
                  Rodada {String(MOCK_HIGHLIGHTS.nextRound.number).padStart(2, "0")}
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-muted" />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-xs text-muted mb-0.5">Data</p>
                <p className="text-sm font-semibold text-foreground">
                  {MOCK_HIGHLIGHTS.nextRound.date}
                </p>
              </div>
              <div className="w-px h-8 bg-border" />
              <div>
                <p className="text-xs text-muted mb-0.5">Confirmados</p>
                <p className="text-sm font-semibold text-foreground">
                  {MOCK_HIGHLIGHTS.nextRound.confirmed} jogadores
                </p>
              </div>
            </div>
            <div className="px-3 py-1.5 rounded-full bg-accent/15 text-accent text-xs font-bold">
              VER RODADA
            </div>
          </div>
        </div>
      </Link>

      {/* Highlights Section */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">
            Destaques
          </h2>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <StatHighlightCard
            emoji="⚽"
            label="Artilheiro"
            playerName={MOCK_HIGHLIGHTS.topScorer.nickname}
            value={MOCK_HIGHLIGHTS.topScorer.goals}
            unit="gols"
            delay="stagger-1"
          />
          <StatHighlightCard
            emoji="🎯"
            label="Assistências"
            playerName={MOCK_HIGHLIGHTS.topAssists.nickname}
            value={MOCK_HIGHLIGHTS.topAssists.assists}
            unit="assists"
            delay="stagger-2"
          />
          <StatHighlightCard
            emoji="🏆"
            label="Vitórias"
            playerName={MOCK_HIGHLIGHTS.topWins.nickname}
            value={MOCK_HIGHLIGHTS.topWins.wins}
            unit="vitórias"
            delay="stagger-3"
          />
        </div>
      </section>

      {/* Ranking Preview */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">
            🏅 Ranking
          </h2>
          <Link
            href="/ranking"
            className="text-xs font-semibold text-accent hover:text-accent-light transition-colors"
          >
            Ver completo →
          </Link>
        </div>

        <div className="glass-card overflow-hidden">
          {MOCK_RANKING.map((player, index) => (
            <div
              key={player.rank}
              className={`
                flex items-center gap-3 px-4 py-3.5 animate-fade-in
                ${index < MOCK_RANKING.length - 1 ? "border-b border-border" : ""}
                stagger-${index + 1}
                hover:bg-surface-hover transition-colors cursor-pointer
              `}
            >
              <RankBadge rank={player.rank} />
              
              {/* Avatar */}
              <div className="w-9 h-9 rounded-full bg-surface-hover flex items-center justify-center text-xs font-bold text-muted flex-shrink-0">
                {player.name.slice(0, 2).toUpperCase()}
              </div>

              {/* Name */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
                  {player.name}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-muted">
                    ⚽ {player.goals}
                  </span>
                  <span className="text-[10px] text-muted">
                    🎯 {player.assists}
                  </span>
                </div>
              </div>

              {/* Points */}
              <div className="text-right">
                <p className="stat-number text-lg gradient-text">
                  {player.points}
                </p>
                <p className="text-[10px] text-muted font-medium">pts</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Last Round Summary */}
      <section>
        <h2 className="text-sm font-bold text-foreground uppercase tracking-wider mb-3">
          📋 Última Rodada
        </h2>

        <Link href="/rodadas" className="block">
          <div className="glass-card glass-card-hover p-4 animate-fade-in-up">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-foreground">
                Rodada {String(MOCK_HIGHLIGHTS.lastRound.number).padStart(2, "0")}
              </p>
              <span className="text-xs text-muted">
                {MOCK_HIGHLIGHTS.lastRound.date}
              </span>
            </div>

            {/* Mini match results */}
            <div className="space-y-2">
              {[
                { a: "Azul", b: "Vermelho", sa: 1, sb: 2, ca: "#3B82F6", cb: "#EF4444" },
                { a: "Preto", b: "Azul", sa: 0, sb: 2, ca: "#374151", cb: "#3B82F6" },
                { a: "Vermelho", b: "Preto", sa: 3, sb: 1, ca: "#EF4444", cb: "#374151" },
              ].map((match, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 py-1.5 text-xs"
                >
                  <div className="flex items-center gap-1.5 flex-1 justify-end">
                    <span className="font-semibold text-foreground/80">
                      {match.a}
                    </span>
                    <span
                      className="team-dot"
                      style={{ backgroundColor: match.ca }}
                    />
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface min-w-[3.5rem] justify-center">
                    <span
                      className={`font-bold ${
                        match.sa > match.sb
                          ? "text-accent"
                          : "text-foreground/60"
                      }`}
                    >
                      {match.sa}
                    </span>
                    <span className="text-muted">×</span>
                    <span
                      className={`font-bold ${
                        match.sb > match.sa
                          ? "text-accent"
                          : "text-foreground/60"
                      }`}
                    >
                      {match.sb}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-1">
                    <span
                      className="team-dot"
                      style={{ backgroundColor: match.cb }}
                    />
                    <span className="font-semibold text-foreground/80">
                      {match.b}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Link>
      </section>
    </div>
  );
}
