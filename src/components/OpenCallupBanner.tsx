import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Flag,
  Football,
  MapPin,
  Radio,
  Users,
} from "@/components/icons";

export type ActiveCallupData = {
  id: string;
  date: string;
  startTime?: string | null;
  stadiumName?: string | null;
  stadiumMapUrl?: string | null;
  roundType: "official" | "friendly";
  capacity: number;
  waitlistCapacity: number;
  confirmed: number;
  waiting: number;
};

export type UserCallupEntry = {
  playerId: string;
  status: "confirmed" | "waitlist";
  position: number;
} | null;

export function OpenCallupBanner({
  callup,
  userEntry = null,
}: {
  callup: ActiveCallupData;
  userEntry?: UserCallupEntry;
}) {
  const formattedDate = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" })
    .format(new Date(`${callup.date}T12:00:00`));
  const timeFormatted = callup.startTime ? callup.startTime.slice(0, 5) : "08:00";
  const remaining = Math.max(0, callup.capacity - callup.confirmed);
  const isFull = callup.confirmed >= callup.capacity;

  const isConfirmed = userEntry?.status === "confirmed";
  const isWaiting = userEntry?.status === "waitlist";

  // Definir textos e cores baseados no estado
  let badgeLabel = "Lista aberta";
  let badgeIcon = <Radio className="h-3.5 w-3.5 animate-pulse" />;
  let badgeClass = "border-accent/35 bg-accent/10 text-accent";
  let topTag = "Atenção, boleiros";
  let title = "Você foi convocado!";
  let subtitle = `${formattedDate} às ${timeFormatted}. Confirme seu nome antes que o professor feche a lista.`;

  if (isConfirmed) {
    badgeLabel = "Presença confirmada";
    badgeIcon = <CheckCircle2 className="h-3.5 w-3.5" />;
    badgeClass = "border-success/40 bg-success/15 text-success";
    topTag = "Tudo pronto, craque";
    title = "Você está escalado!";
    subtitle = `${formattedDate} às ${timeFormatted}. Sua vaga de titular está confirmada na pelada. Prepare as chuteiras!`;
  } else if (isWaiting) {
    badgeLabel = "Na lista de espera";
    badgeIcon = <Clock className="h-3.5 w-3.5" />;
    badgeClass = "border-warning/40 bg-warning/15 text-warning";
    topTag = "Aguardando vaga";
    title = `Fila de espera #${userEntry.position}`;
    subtitle = `${formattedDate} às ${timeFormatted}. Você está na posição #${userEntry.position}. Se alguém desistir, você sobe automaticamente!`;
  } else if (isFull) {
    badgeLabel = "Vagas no time esgotadas";
    badgeIcon = <Clock className="h-3.5 w-3.5 text-warning" />;
    badgeClass = "border-warning/35 bg-warning/10 text-warning";
    topTag = "Fila de espera aberta";
    title = "Entre na lista de espera";
    subtitle = `${formattedDate} às ${timeFormatted}. Os 15 titulares estão preenchidos. Garanta seu lugar na fila de espera para jogar caso alguém desista!`;
  }

  return (
    <div className="group relative isolate flex h-full min-h-[350px] sm:min-h-[360px] flex-col justify-between overflow-hidden rounded-[28px] border border-accent/45 bg-[#07150d] p-5 shadow-[0_18px_45px_rgba(0,0,0,.34),0_0_28px_rgba(204,255,0,.08)] sm:p-6">
      <Link href="/rodadas" className="absolute inset-0 z-10" aria-label="Abrir agenda da pelada" />
      <div
        className="pointer-events-none absolute inset-0 opacity-35"
        style={{
          backgroundImage:
            "linear-gradient(rgba(204,255,0,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(204,255,0,.08) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-accent/20 blur-3xl transition-transform duration-500 group-hover:scale-125" />
      <div className="pointer-events-none absolute -bottom-20 -left-12 h-40 w-40 rounded-full bg-warning/15 blur-3xl" />

      <div className="pointer-events-none relative z-20 flex h-full flex-col justify-between gap-3">
        {/* Header Badges */}
        <div className="flex items-center justify-between gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-athletic text-[10px] font-black uppercase italic tracking-[0.18em] ${badgeClass}`}
          >
            {badgeIcon} {badgeLabel}
          </span>
          <span className="rounded-full border border-warning/25 bg-warning/10 px-2.5 py-1 text-[9px] font-black uppercase text-warning">
            {callup.roundType === "friendly" ? "Amistoso" : "Ranked"}
          </span>
        </div>

        {/* Mensagem e Ícone */}
        <div className="flex items-start gap-4">
          <div
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${
              isConfirmed ? "bg-success text-background" : "bg-accent text-background"
            } shadow-[0_0_28px_rgba(204,255,0,.2)]`}
          >
            {isConfirmed ? <CheckCircle2 className="h-7 w-7" /> : <Flag className="h-7 w-7" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-athletic text-[10px] font-black uppercase italic tracking-[0.25em] text-warning">
              {topTag}
            </p>
            <h2 className="mt-1 font-athletic text-2xl font-black uppercase italic leading-none text-white">
              {title}
            </h2>
            <p className="mt-2 text-xs font-semibold capitalize leading-5 text-muted">
              {subtitle}
            </p>
          </div>
        </div>

        {/* Estádio / Local com botão direto do Google Maps */}
        {callup.stadiumName && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <MapPin className="h-4 w-4 text-accent shrink-0" />
              <div className="min-w-0">
                <p className="truncate text-xs font-black text-foreground">{callup.stadiumName}</p>
                <p className="text-[10px] text-muted">Horário da pelada: {timeFormatted}</p>
              </div>
            </div>
            {callup.stadiumMapUrl && (
              <a
                href={callup.stadiumMapUrl}
                target="_blank"
                rel="noreferrer"
                className="pointer-events-auto relative z-30 inline-flex items-center gap-1 rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-1.5 text-[10px] font-black uppercase text-accent hover:bg-accent/20 transition-colors shrink-0"
              >
                Ver onde fica <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        )}

        {/* Barra de Status e indicação única de navegação */}
        <div className="grid grid-cols-[1fr_auto] items-center gap-3 border-t border-white/10 pt-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex -space-x-1.5 text-accent">
              <Users className="h-5 w-5" />
              <Football className="h-5 w-5 rounded-full bg-[#07150d]" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-black text-foreground">
                {callup.confirmed}/{callup.capacity} confirmados
              </p>
              <p className="truncate text-[9px] font-semibold text-muted">
                {remaining > 0
                  ? `${remaining} vagas no time`
                  : `${callup.waiting}/${callup.waitlistCapacity} na fila de espera`}
              </p>
            </div>
          </div>
          <span className="max-w-[112px] text-right text-[9px] font-black uppercase leading-4 tracking-wide text-accent">
            Toque para ver a agenda
          </span>
        </div>
      </div>
    </div>
  );
}
