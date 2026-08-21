import Link from "next/link";
import { Crown } from "@/components/icons";
import type { SeasonPassDashboard } from "@/lib/actions/fantasy";
import { SeasonPassPitch } from "./SeasonPassPitch";

const eventLabels = {
  participation: "Participação em rodada",
  valid_lineup: "Escalação válida",
  full_round: "Jogou e escalou",
  goals_assists_cycle: "Ciclo de gols e assistências",
  participation_streak: "9 participações na temporada",
  lineup_streak: "9 escalações na temporada",
} as const;

export function SeasonPassExperience({ pass }: { pass: SeasonPassDashboard }) {
  const progress = pass.progress;

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[2rem] border border-[#a65cff]/45 bg-gradient-to-br from-[#321064] via-[#160c2c] to-[#07170e] p-6 shadow-[0_0_35px_rgba(142,65,255,0.18)]">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[#a04dff]/20 blur-3xl" />
        <Crown className="relative h-10 w-10 text-[#d2a2ff]" />
        <p className="relative mt-4 font-athletic text-xs font-black uppercase italic tracking-[0.22em] text-[#bd82ff]">Passe BQ · V1</p>
        <h2 className="relative mt-1 font-athletic text-3xl font-black uppercase italic leading-none text-white">Casa {progress} de 40</h2>
        <p className="relative mt-3 max-w-sm text-sm leading-6 text-white/65">
          {pass.mode === "community"
            ? "Sua trilha avança ao montar escalações válidas nas rodadas Ranked."
            : "Jogue, escale e some gols e assistências nas rodadas Ranked para avançar na trilha."}
        </p>
        <p className="relative mt-5 text-[10px] font-black uppercase tracking-[0.16em] text-[#d7adff]">Da torcida ao centroavante · 40 casas</p>
      </section>

      {!pass.authenticated ? (
        <section className="rounded-2xl border border-border bg-surface p-5 text-center">
          <p className="text-sm font-black text-foreground">Entre para acompanhar sua trilha</p>
          <Link href="/login?next=/jogadores?tab=passe" className="mt-4 inline-flex rounded-xl bg-accent px-4 py-3 text-xs font-black uppercase text-background">Entrar ou criar conta</Link>
        </section>
      ) : !pass.available ? (
        <section className="rounded-2xl border border-warning/25 bg-warning/10 p-5 text-center"><p className="text-sm font-black text-foreground">Passe aguardando ativação</p><p className="mt-1 text-xs text-muted">Execute a migration 060 no Supabase para liberar sua progressão.</p></section>
      ) : (
        <>
          <section className="grid grid-cols-3 gap-2"><Metric label="Peladas" value={pass.participations} /><Metric label="Escalações" value={pass.validLineups} /><Metric label="G+A p/ ciclo" value={`${pass.goalsAssistsRemainder}/5`} /></section>
          <SeasonPassPitch progress={progress} playerName={pass.playerName} playerAvatarUrl={pass.playerAvatarUrl} />
          <section className="rounded-3xl border border-border bg-surface p-4"><p className="font-athletic text-xs font-black uppercase italic tracking-[0.16em] text-accent">Como avançar</p><ul className="mt-3 space-y-2 text-xs leading-5 text-muted">{pass.mode === "community" ? <><li><strong className="text-foreground">+4 casas</strong> por escalação válida em rodada Ranked.</li><li><strong className="text-foreground">+4 casas</strong> extras ao completar 9 escalações.</li></> : <><li><strong className="text-foreground">+2 casas</strong> ao jogar uma rodada Ranked.</li><li><strong className="text-foreground">+1 casa</strong> pela escalação válida; mais <strong className="text-foreground">+1</strong> se você também entrou em campo.</li><li><strong className="text-foreground">+1 casa</strong> a cada ciclo de 5 gols+assistências, no máximo uma vez por rodada.</li><li><strong className="text-foreground">+4 casas</strong> ao completar 9 participações.</li></>}</ul></section>
          {pass.events.length > 0 && <section className="rounded-3xl border border-border bg-surface p-4"><p className="font-athletic text-xs font-black uppercase italic tracking-[0.16em] text-accent">Últimos avanços</p><div className="mt-3 divide-y divide-border/70">{pass.events.map((event) => <div key={event.id} className="flex items-center justify-between gap-3 py-3"><div><p className="text-xs font-black text-foreground">{eventLabels[event.eventType]}</p><p className="mt-0.5 text-[10px] text-muted">{event.roundNumber ? `Rodada ${String(event.roundNumber).padStart(2, "0")}` : "Temporada BQ"}</p></div><span className="font-athletic text-lg font-black text-[#d7adff]">+{event.houses}</span></div>)}</div></section>}
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-2xl border border-border bg-surface p-3 text-center"><span className="block font-athletic text-xl font-black text-accent">{value}</span><span className="mt-1 block text-[8px] font-black uppercase tracking-wider text-muted">{label}</span></div>;
}
