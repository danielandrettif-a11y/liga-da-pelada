"use client";

import Link from "next/link";
import { useState, useTransition, useEffect } from "react";
import { createPortal } from "react-dom";
import { Bell, CheckCircle2, X } from "@/components/icons";
import { markInboxRead, type InboxNotification } from "@/lib/actions/inbox";

export function InboxBell({
  notifications = [],
}: {
  notifications?: InboxNotification[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pending, startTransition] = useTransition();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setMounted(true);
  }, []);

  // Filtra apenas notificações ativas e não descartadas localmente
  const unreadItems = notifications.filter(
    (item) => !item.read_at && item.state === "active" && !dismissedIds.has(item.id)
  );

  const unreadCount = unreadItems.length;

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
    <>
      {/* Botão de Sino Compacto */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-surface/80 text-foreground transition-all hover:border-accent/40 hover:bg-surface active:scale-95 shadow-sm"
        aria-label="Abrir avisos"
        aria-expanded={isOpen}
      >
        <Bell className="h-5 w-5 text-muted hover:text-foreground transition-colors" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-black text-white ring-2 ring-[#05100B] animate-pulse shadow-md shadow-danger/50">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Modal Flutuante de Notificações com Portal Global (Z-Index Máximo) */}
      {isOpen &&
        mounted &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[99999] flex items-start justify-center sm:justify-end p-4 pt-16 sm:pt-14 sm:pr-8 bg-black/60 backdrop-blur-xs animate-fade-in"
            onClick={() => setIsOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Central de avisos"
          >
            <div
              className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-accent/30 bg-[#07150d] p-0 shadow-[0_20px_60px_rgba(0,0,0,0.95)] animate-fade-in-up"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header do Popover */}
              <div className="flex items-center justify-between border-b border-border/80 px-4 py-3.5 bg-black/40">
                <div className="flex items-center gap-2">
                  <span className="font-athletic text-sm font-black uppercase tracking-wider text-foreground">
                    Avisos
                  </span>
                  {unreadCount > 0 && (
                    <span className="rounded-full bg-danger/20 px-2 py-0.5 text-[9px] font-black uppercase text-danger border border-danger/30">
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
                      className="rounded-lg bg-accent/15 px-2.5 py-1 text-[9px] font-black text-accent hover:bg-accent hover:text-background uppercase tracking-tight transition-colors disabled:opacity-50"
                    >
                      Limpar todas
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
                    aria-label="Fechar"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Lista de Notificações */}
              <div className="max-h-[60vh] overflow-y-auto divide-y divide-border/40">
                {unreadItems.length > 0 ? (
                  unreadItems.map((item) => (
                    <div
                      key={item.id}
                      className="group flex items-start justify-between gap-3 p-4 transition-colors hover:bg-surface-hover"
                    >
                      <Link
                        href={item.href}
                        onClick={() => handleItemClick(item.id)}
                        className="flex flex-1 items-start gap-3 min-w-0"
                      >
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-danger shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-black text-foreground group-hover:text-accent transition-colors">
                            {item.title}
                          </p>
                          <p className="mt-1 text-[11px] leading-relaxed text-muted line-clamp-3">
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
                        className="shrink-0 rounded-md p-1.5 text-muted hover:text-white hover:bg-white/10 transition-colors"
                        title="Marcar como lida"
                        aria-label="Marcar como lida"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 text-center text-muted">
                    <CheckCircle2 className="h-7 w-7 text-accent/60 mb-2" />
                    <p className="text-xs font-bold text-foreground">Tudo limpo!</p>
                    <p className="text-[11px] text-muted mt-0.5">
                      Nenhuma notificação pendente no momento.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
