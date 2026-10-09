import Link from "next/link";
import { Trophy } from "@/components/icons";

export type PlayerAchievementBelt = {
  slug: "top_scorer" | "top_assister" | "team_win_streak";
  name: string;
  description: string;
  recordValue: number;
  unit: string;
  scope: "player" | "team";
  roundId: string | null;
  roundNumber: number | null;
  roundDate: string | null;
  team: {
    id: string;
    name: string;
    color: string;
    crestUrl: string | null;
    members: Array<{ id: string; name: string; avatarUrl: string | null }>;
  } | null;
};

export function PlayerBelts({ belts }: { belts: PlayerAchievementBelt[] }) {
  if (belts.length === 0) return null;

  return (
    <section className="rounded-2xl border border-yellow-300/35 bg-gradient-to-br from-yellow-300/15 via-[#1b1707]/90 to-surface/80 p-4 shadow-[0_0_30px_rgba(250,204,21,.1)]">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-yellow-300/40 bg-yellow-300/15 text-yellow-200">
          <Trophy className="h-5 w-5" />
        </span>
        <div>
          <h3 className="text-xs font-black uppercase tracking-wider text-yellow-100">Cinturões em posse</h3>
          <p className="mt-0.5 text-[10px] text-yellow-100/60">O cinturão só muda de dono quando o recorde é superado.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {belts.map((belt) => (
          <details key={belt.slug} className="group overflow-hidden rounded-xl border border-yellow-300/25 bg-black/25 open:bg-black/35">
            <summary className="cursor-pointer list-none p-3 [&::-webkit-details-marker]:hidden">
              <div className="rounded-lg border-2 border-yellow-300/65 bg-gradient-to-r from-[#382907] via-yellow-300/20 to-[#382907] px-3 py-2 text-center shadow-inner">
                <p className="text-[8px] font-black uppercase tracking-[.22em] text-yellow-200/75">Cinturão atual</p>
                <p className="mt-1 text-xs font-black uppercase text-yellow-100">{belt.name}</p>
                <p className="mt-1 text-lg font-black text-yellow-300">{belt.recordValue} <span className="text-[9px] uppercase">{belt.unit}</span></p>
              </div>
              <p className="mt-2 text-center text-[9px] font-bold text-yellow-100/60">Toque para ver o recorde</p>
            </summary>
            <div className="border-t border-yellow-300/15 px-3 py-3 text-[10px] text-yellow-50/70">
              <p>{belt.description}</p>
              {belt.team && (
                <div className="mt-3 rounded-lg border border-white/10 bg-black/25 p-2.5">
                  <p className="font-black uppercase text-yellow-200">Escalação responsável · {belt.team.name}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {belt.team.members.map((member) => (
                      <Link key={member.id} href={`/jogadores/${member.id}`} className="rounded-full border border-white/10 bg-white/5 px-2 py-1 font-bold text-foreground hover:bg-white/10">
                        {member.name}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {belt.roundId && (
                <Link href={`/rodadas/${belt.roundId}`} className="mt-3 block rounded-lg border border-yellow-300/25 px-2 py-1.5 text-center font-black uppercase text-yellow-200 hover:bg-yellow-300/10">
                  Ver rodada {belt.roundNumber ? String(belt.roundNumber).padStart(2, "0") : ""}
                </Link>
              )}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
