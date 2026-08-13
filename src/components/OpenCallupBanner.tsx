import Link from "next/link";
import { ChevronRight, Flag, Football, Radio, Users } from "@/components/icons";

type ActiveCallup = {
  id: string;
  date: string;
  roundType: "official" | "friendly";
  capacity: number;
  waitlistCapacity: number;
  confirmed: number;
  waiting: number;
};

export function OpenCallupBanner({ callup }: { callup: ActiveCallup }) {
  const formattedDate = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" })
    .format(new Date(`${callup.date}T12:00:00`));
  const remaining = Math.max(0, callup.capacity - callup.confirmed);

  return (
    <Link href="/convocacao" className="group relative isolate block overflow-hidden rounded-[26px] border border-accent/45 bg-[#07150d] p-5 shadow-[0_18px_45px_rgba(0,0,0,.34),0_0_28px_rgba(204,255,0,.08)]" aria-label="Abrir convocação e confirmar presença">
      <div className="pointer-events-none absolute inset-0 opacity-35" style={{ backgroundImage: "linear-gradient(rgba(204,255,0,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(204,255,0,.08) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
      <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-accent/20 blur-3xl transition-transform duration-500 group-hover:scale-125" />
      <div className="pointer-events-none absolute -bottom-20 -left-12 h-40 w-40 rounded-full bg-warning/15 blur-3xl" />

      <div className="relative z-10">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/35 bg-accent/10 px-3 py-1.5 font-athletic text-[10px] font-black uppercase italic tracking-[0.18em] text-accent">
            <Radio className="h-3.5 w-3.5 animate-pulse" /> Lista aberta
          </span>
          <span className="rounded-full border border-warning/25 bg-warning/10 px-2.5 py-1 text-[9px] font-black uppercase text-warning">
            {callup.roundType === "friendly" ? "Amistoso" : "Ranked"}
          </span>
        </div>

        <div className="mt-5 flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent text-background shadow-[0_0_28px_rgba(204,255,0,.2)]">
            <Flag className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <p className="font-athletic text-[10px] font-black uppercase italic tracking-[0.25em] text-warning">Atenção, boleiros</p>
            <h2 className="mt-1 font-athletic text-2xl font-black uppercase italic leading-none text-white">Você foi convocado!</h2>
            <p className="mt-2 text-xs font-semibold capitalize leading-5 text-muted">{formattedDate}. Confirme seu nome antes que o professor feche a lista.</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-[1fr_auto] items-center gap-3 border-t border-white/10 pt-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex -space-x-1.5 text-accent"><Users className="h-5 w-5" /><Football className="h-5 w-5 rounded-full bg-[#07150d]" /></div>
            <div className="min-w-0">
              <p className="truncate text-xs font-black text-foreground">{callup.confirmed}/{callup.capacity} confirmados</p>
              <p className="truncate text-[9px] font-semibold text-muted">{remaining > 0 ? `${remaining} vagas no time` : `${callup.waiting}/${callup.waitlistCapacity} na fila de espera`}</p>
            </div>
          </div>
          <span className="flex items-center gap-1 rounded-xl bg-accent px-3 py-2.5 text-[10px] font-black uppercase text-background shadow-[0_0_20px_rgba(204,255,0,.16)]">
            Confirmar <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}
