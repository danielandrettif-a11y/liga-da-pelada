"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Bell, CheckCircle2, ChevronDown, Sparkles, X } from "@/components/icons";
import { markInboxRead, type InboxNotification } from "@/lib/actions/inbox";

export function InboxCard({
  notifications,
  showAll = false,
}: {
  notifications: InboxNotification[];
  showAll?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [isExpanded, setIsExpanded] = useState(showAll);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // Filtra apenas notificações ativas e que não foram dispensadas localmente
  const unreadItems = notifications.filter(
    (item) => !item.read_at && item.state === "active" && !dismissedIds.has(item.id)
  );

  const shownItems = showAll
    ? notifications.filter((item) => !dismissedIds.has(item.id))
    : unreadItems;

  const unreadCount = unreadItems.length;

  // Se não houver nada e não for página de histórico, não ocupa espaço
  if (!showAll && unreadCount === 0 && dismissedIds.size > 0) {
    return null;
  }
  if (!notifications.length) {
    return null;
  }

  const handleMarkAllRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    const idsToClear = shownItems.map((item) => item.id);
    setDismissedIds((prev) => new Set([...prev, ...idsToClear]));
    startTransition(() => {
      void markInboxRead();
    });
  };

  const handleItemClick = (id: string) => {
    setDismissedIds((prev) => new Set([...prev, id]));
    startTransition(() => {
      void markInboxRead([id]);
    });
  };

  return (
    <section className="glass-card overflow-hidden rounded-2xl border border-accent/25 transition-all shadow-md">
      {/* HEADER / BARRA DE GATILHO RECOLHÍVEL */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`relative flex h-7 w-7 items-center justify-center rounded-xl transition-colors ${
            unreadCount > 0 ? "bg-accent text-background shadow-md shadow-accent/30" : "bg-white/10 text-muted"
          }`}>
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-danger text-[8px] font-black text-white ring-2 ring-background animate-pulse">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-black uppercase tracking-tight text-foreground">
                Avisos
              </h2>
              {unreadCount > 0 && (
                <span className="rounded-full bg-accent/20 px-2 py-0.5 font-athletic text-[8px] font-black uppercase text-accent">
                  {unreadCount} {unreadCount === 1 ? "nova" : "novas"}
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted truncate">
              {unreadCount > 0
                ? isExpanded
                  ? "Toque para recolher"
                  : "Toque para abrir e ver novidades"
                : "Tudo em dia com sua conta ✨"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {unreadCount > 0 && isExpanded && (
            <button
              type="button"
              disabled={pending}
              onClick={handleMarkAllRead}
              className="rounded-lg bg-accent/15 px-2.5 py-1 text-[9px] font-black uppercase tracking-tight text-accent hover:bg-accent hover:text-background transition-colors disabled:opacity-40"
              title="Marcar todas como lidas e limpar"
            >
              Limpar todas
            </button>
          )}
          <ChevronDown
            className={`h-4 w-4 text-muted transition-transform duration-200 ${
              isExpanded ? "rotate-180 text-accent" : ""
            }`}
          />
        </div>
      </button>

      {/* CONTEÚDO EXPANDÍVEL */}
      {isExpanded && (
        <div className="border-t border-border animate-fade-in divide-y divide-border/60 bg-black/20">
          {shownItems.length > 0 ? (
            shownItems.map((item) => (
              <div
                key={item.id}
                className="group flex items-start justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-hover"
              >
                <Link
                  href={item.href}
                  onClick={() => handleItemClick(item.id)}
                  className="flex flex-1 items-start gap-2.5 min-w-0"
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      item.read_at ? "bg-muted" : "bg-accent shadow-sm shadow-accent"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-foreground group-hover:text-accent transition-colors">
                      {item.title}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                      {item.body}
                    </p>
                  </div>
                </Link>

                <button
                  type="button"
                  onClick={() => handleItemClick(item.id)}
                  className="shrink-0 rounded-md p-1 text-muted hover:text-white hover:bg-white/10 transition-colors"
                  title="Marcar como lido e limpar"
                  aria-label="Marcar como lido"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          ) : (
            <div className="flex items-center gap-2 px-4 py-4 text-xs font-bold text-success">
              <CheckCircle2 className="h-4 w-4" />
              <span>Nenhuma pendência ou notificação no momento.</span>
            </div>
          )}

          {!showAll && notifications.length > 3 && (
            <Link
              href="/notificacoes"
              className="block px-4 py-2.5 text-center text-[10px] font-black uppercase tracking-wider text-accent hover:underline bg-white/[0.01]"
            >
              Ver histórico completo →
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
