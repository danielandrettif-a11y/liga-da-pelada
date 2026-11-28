import Link from "next/link";
import { ArrowLeft, ClipboardList } from "@/components/icons";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { getRegistrationHistory } from "@/lib/actions/registrations";
import type { PlayerRegistrationEvent } from "@/lib/types";

export const revalidate = 0;

const CATEGORY_LABELS = {
  player: "Jogador",
  guest: "Convidado",
  wag: "WAG",
  supporter: "Torcida",
};

function formatRegistrationOrigin(event: PlayerRegistrationEvent) {
  const originType =
    event.origin_type ||
    (event.source === "admin"
      ? "registered_by_admin"
      : event.source === "site_signup"
        ? event.member_category === "guest"
          ? "registered_by_user"
          : "self_email"
        : "legacy");

  if (originType === "self_email") {
    const isGoogle = event.signup_provider === "google";
    return {
      badge: isGoogle ? "Conta Google" : "E-mail próprio",
      description: event.signup_email
        ? isGoogle
          ? `Cadastro próprio via Google · ${event.signup_email}`
          : `Cadastro próprio com e-mail · ${event.signup_email}`
        : "Cadastro próprio no site",
    };
  }

  if (originType === "registered_by_user") {
    return {
      badge: event.member_category === "guest" ? "Convidado por usuário" : "Por usuário",
      description: `Cadastrado por ${event.created_by_name || "usuário não identificado"}`,
    };
  }

  if (originType === "registered_by_admin") {
    return {
      badge: "Via ADM",
      description: `Cadastrado pelo ADM ${event.created_by_name || "não identificado"}`,
    };
  }

  return {
    badge: "Legado",
    description: "Origem anterior ao histórico de auditoria",
  };
}

export default async function HistoricoCadastrosPage() {
  const events = await getRegistrationHistory();
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/mais" className="flex h-10 w-10 items-center justify-center rounded-full bg-surface hover:bg-surface-hover">
          <ArrowLeft className="h-5 w-5 text-muted" />
        </Link>
        <div>
          <h1 className="text-xl font-black text-foreground">Histórico de Cadastros</h1>
          <p className="mt-0.5 text-xs text-muted">Origem e entradas registradas no Elenco</p>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        {events.map((event, index) => {
          const origin = formatRegistrationOrigin(event);
          return (
            <div key={event.id} className={`flex items-center gap-3 p-4 ${index < events.length - 1 ? "border-b border-border" : ""}`}>
              <PlayerAvatar name={event.player_name} avatarUrl={event.avatar_url} className="h-11 w-11 shrink-0 rounded-full border border-border bg-surface text-xs font-black text-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-foreground">{event.player_name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full border border-border px-2 py-0.5 text-[8px] font-black uppercase text-muted">{CATEGORY_LABELS[event.member_category]}</span>
                  <span className="rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-[8px] font-black uppercase text-accent">{origin.badge}</span>
                </div>
                <p className="mt-1 truncate text-[10px] text-muted">{origin.description}</p>
              </div>
              <time className="shrink-0 text-right text-[9px] font-bold leading-4 text-muted" dateTime={event.created_at}>
                {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(event.created_at))}
              </time>
            </div>
          );
        })}
        {events.length === 0 && (
          <div className="flex flex-col items-center p-10 text-center text-muted">
            <ClipboardList className="mb-3 h-8 w-8" />
            <p className="text-sm font-bold">Nenhum cadastro registrado.</p>
          </div>
        )}
      </div>
    </div>
  );
}
