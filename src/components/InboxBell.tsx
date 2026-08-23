"use client";

import Link from "next/link";
import { useState, useTransition, useRef, useEffect } from "react";
import { Bell, CheckCircle2, X } from "@/components/icons";
import { markInboxRead, type InboxNotification } from "@/lib/actions/inbox";

export function InboxBell({
  notifications = [],
}: {
  notifications?: InboxNotification[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const popoverRef = useRef<HTMLDivElement>(null);

  // Filtra apenas notificações ativas e não descartadas localmente
  const unreadItems = notifications.filter(
    (item) => !item.read_at && item.state === "active" && !dismissedIds.has(item.id)
  );

  const unreadCount = unreadItems.length;

  // Fechar ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleMarkAllRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    const idsToClear = unreadItems.map((item) => item.id);
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
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block" ref={popoverRef}>
      {/* Botão de Sino Compacto */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-surface/80 text-foreground transition-all hover:border-accent/40 hover:bg-surface active:scale-95 shadow-sm"
        aria-label="Abrir notificações"
        aria-expanded={isOpen}
      >
        <Bell className="h-5 w-5 text-muted hover:text-foreground transition-colors" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-black text-white ring-2 ring-[#05100B] animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Popover de Notificações */}
      {isOpen && (
        <div className="absolute right-0 top-12 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-accent/25 bg-[#07150d]/98 p-0 shadow-[0_12px_40px_rgba(0,0,0,0.85)] backdrop-blur-md animate-fade-in">
          {/* Header do Popover */}
          <div className="flex items-center justify-between border-b border-border/80 px-4 py-3 bg-black/40">
            <div className="flex items-center gap-2">
              <span className="font-athletic text-xs font-black uppercase tracking-wider text-foreground">
                Notificações
              </span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-danger/20 px-1.5 py-0.2 text-[8px] font-black uppercase text-danger border border-danger/30">
                  {unreadCount} nova{unreadCount > 1 ? "s" : ""}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={handleMarkAllRead}
                  className="text-[9px] font-bold text-accent hover:underline uppercase tracking-tight disabled:opacity-50"
                >
                  Limpar
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-md p-1 text-muted hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Lista de Notificações */}
          <div className="max-h-80 overflow-y-auto divide-y divide-border/40">
            {unreadItems.length > 0 ? (
              unreadItems.map((item) => (
                <div
                  key={item.id}
                  className="group flex items-start justify-between gap-2.5 p-3.5 transition-colors hover:bg-surface-hover"
                >
                  <Link
                    href={item.href}
                    onClick={() => handleItemClick(item.id)}
                    className="flex flex-1 items-start gap-2.5 min-w-0"
                  >
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-danger shadow-[0_0_6px_rgba(239,68,68,0.8)]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black text-foreground group-hover:text-accent transition-colors">
                        {item.title}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted line-clamp-3">
                        {item.body}
                      </p>
                    </div>
                  </Link>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleItemClick(item.id);
                    }}
                    className="shrink-0 rounded-md p-1 text-muted hover:text-white hover:bg-white/10 transition-colors"
                    title="Marcar como lida"
                    aria-label="Marcar como lida"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center p-6 text-center text-muted">
                <CheckCircle2 className="h-6 w-6 text-accent/60 mb-2" />
                <p className="text-xs font-bold text-foreground">Tudo limpo!</p>
                <p className="text-[10px] text-muted mt-0.5">
                  Nenhuma notificação nova no momento.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
