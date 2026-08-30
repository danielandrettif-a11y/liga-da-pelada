import Link from "next/link";
import type { SeasonPassDashboard } from "@/lib/actions/fantasy";
import { SeasonPassRules } from "./SeasonPassRules";
import type { CosmeticsDashboard } from "@/lib/actions/cosmetics";
import { SeasonPassRewards } from "./SeasonPassRewards";
import { SeasonPassShop } from "./SeasonPassShop";

const eventLabels = {
  valid_lineup: "Escalação válida",
} as const;

export function SeasonPassExperience({ pass, cosmetics, rewardId }: { pass: SeasonPassDashboard; cosmetics?: CosmeticsDashboard; rewardId?: string }) {
  const progress = pass.progress;

  return (
    <div className="space-y-4">
      {cosmetics ? <SeasonPassRewards pass={pass} cosmetics={cosmetics} rewardId={rewardId} /> : null}

      {!pass.authenticated ? (
        <section className="rounded-2xl border border-border bg-surface p-5 text-center">
          <p className="text-sm font-black text-foreground">Entre para acompanhar sua trilha</p>
          <Link href="/login?next=/jogadores?tab=passe" className="mt-4 inline-flex rounded-xl bg-accent px-4 py-3 text-xs font-black uppercase text-background">Entrar ou criar conta</Link>
        </section>
      ) : !pass.available ? (
        <section className="rounded-2xl border border-warning/25 bg-warning/10 p-5 text-center"><p className="text-sm font-black text-foreground">Passe aguardando ativação</p><p className="mt-1 text-xs text-muted">Execute a migration 060 no Supabase para liberar sua progressão.</p></section>
      ) : (
        <>
          <section className="rounded-3xl border border-[#a65cff]/30 bg-[#110b20]/70 p-3.5">
            <div className="flex items-start justify-between gap-3 px-1">
              <div>
                <p className="font-athletic text-[10px] font-black uppercase italic tracking-[0.18em] text-[#d7adff]">Resumo da temporada</p>
                <p className="mt-1 text-xs leading-5 text-muted">Faça uma escalação válida no Cartola para avançar +4 casas.</p>
              </div>
              <span className="shrink-0 rounded-xl border border-[#a65cff]/35 bg-[#a04dff]/15 px-2.5 py-1.5 font-athletic text-sm font-black text-[#e0b9ff]">{progress}/40</span>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-1.5"><Metric label="Casas" value={`${progress}/40`} /><Metric label="Escalações" value={pass.validLineups} /><Metric label={pass.mode === "athlete" ? "Peladas" : "Cartola"} value={pass.mode === "athlete" ? pass.participations : pass.validLineups} /><Metric label="Bônus loja" value={`${pass.mode === "athlete" ? pass.participations % 5 : pass.validLineups % 5}/5`} /></div>
          </section>
          <SeasonPassRules mode={pass.mode} />
          {cosmetics ? <SeasonPassShop shop={cosmetics.shop} /> : null}
          <section className="rounded-3xl border border-border bg-surface p-4 text-xs leading-5 text-muted"><p className="font-athletic text-xs font-black uppercase italic tracking-[0.16em] text-accent">Regra justa de semana ativa</p><p className="mt-2">Se você não conseguiu ir, uma escalação válida ainda garante o avanço completo da semana. Só gols e assistências continuam exclusivos de quem entrou em campo.</p></section>
          {pass.events.length > 0 && <section className="rounded-3xl border border-border bg-surface p-4"><p className="font-athletic text-xs font-black uppercase italic tracking-[0.16em] text-accent">Últimos avanços</p><div className="mt-3 divide-y divide-border/70">{pass.events.map((event) => <div key={event.id} className="flex items-center justify-between gap-3 py-3"><div><p className="text-xs font-black text-foreground">{eventLabels[event.eventType]}</p><p className="mt-0.5 text-[10px] text-muted">{event.roundNumber ? `Rodada ${String(event.roundNumber).padStart(2, "0")}` : "Temporada BQ"}</p></div><span className="font-athletic text-lg font-black text-[#d7adff]">+{event.houses}</span></div>)}</div></section>}
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="min-w-0 rounded-xl border border-white/10 bg-black/15 px-1.5 py-2 text-center"><span className="block truncate font-athletic text-base font-black text-accent">{value}</span><span className="mt-0.5 block truncate text-[7px] font-black uppercase tracking-wide text-muted">{label}</span></div>;
}
