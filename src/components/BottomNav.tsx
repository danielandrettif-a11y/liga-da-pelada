"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Home, CartolaHat, Trophy, Users, MoreHorizontal, ArrowLeftRight, Flag, CalendarDays, Microphone } from "@/components/icons";

const NAV_ITEMS = [
  { href: "/", label: "Início", icon: Home },
  { href: "/cartola", label: "Cartola", icon: CartolaHat },
  { href: "/ranking", label: "Ranking", icon: Trophy },
  { href: "/jogadores", label: "Elenco", icon: Users },
  { href: "/mais", label: "Mais", icon: MoreHorizontal },
] as const;

export function BottomNav({
  isAuthenticated,
  hasOpenCallup,
  hasReleasedPayment,
  collective,
  newRosterCount,
}: {
  isAuthenticated: boolean;
  hasOpenCallup: boolean;
  hasReleasedPayment: boolean;
  collective: { callupId: string; unreadCount: number } | null;
  newRosterCount: number;
}) {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [unreadRoster, setUnreadRoster] = useState(newRosterCount);

  useEffect(() => setUnreadRoster(newRosterCount), [newRosterCount]);
  useEffect(() => {
    const clearRosterBadge = () => setUnreadRoster(0);
    window.addEventListener("roster-unread-cleared", clearRosterBadge);
    return () => window.removeEventListener("roster-unread-cleared", clearRosterBadge);
  }, []);
  useEffect(() => {
    if (pathname.startsWith("/admin/jogadores")) setUnreadRoster(0);
    // Limpa o estado pendente quando a rota realmente terminar de navegar
    setPendingHref(null);
  }, [pathname]);

  // A segunda posição nunca muda. Quando houver lista aberta, ela volta a usar
  // o nome familiar "Convocação" e mantém os demais atalhos no mesmo lugar.
  const agendaItem = hasOpenCallup
    ? { href: "/convocacao", label: "Convocação", icon: Flag, notification: true }
    : hasReleasedPayment
      ? { href: "/pagamentos", label: "Agenda", icon: ArrowLeftRight, notification: true }
      : { href: "/rodadas", label: "Agenda", icon: CalendarDays, notification: false };
  const communityItem = collective
    ? { href: `/coletiva?callup=${collective.callupId}`, label: "Coletiva", icon: Microphone }
    : NAV_ITEMS[3];
  const contextualItems = [NAV_ITEMS[0], agendaItem, NAV_ITEMS[1], NAV_ITEMS[2], communityItem, NAV_ITEMS[4]];
  const visibleItems = isAuthenticated
    ? contextualItems
    : contextualItems.filter((item) => item.href !== "/mais");

  return (
    <nav className="app-bottom-nav fixed inset-x-0 bottom-0 z-[100] border-t border-border bg-background pb-[env(safe-area-inset-bottom)]">
      <div
        className="mx-auto grid h-16 w-full max-w-lg items-stretch px-1"
        style={{ gridTemplateColumns: `repeat(${visibleItems.length}, minmax(0, 1fr))` }}
      >
        {visibleItems.map((item) => {
          const itemPath = item.href.split("?")[0];
          const isCurrentRoute =
            itemPath === "/"
              ? pathname === "/"
              : pathname.startsWith(itemPath);

          const isPending = pendingHref === item.href;
          const isActive = pendingHref ? isPending : isCurrentRoute;

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              aria-label={item.label}
              onClick={() => {
                if (!isCurrentRoute) {
                  setPendingHref(item.href);
                }
              }}
              className={`
                relative flex min-w-0 overflow-hidden flex-col items-center justify-center gap-1 rounded-xl px-0.5 py-1.5
                transition-all duration-150 active:scale-90
                ${isActive
                  ? "text-accent"
                  : "text-muted hover:text-foreground/70"
                }
              `}
            >
              {/* Active indicator bar */}
              {isActive && (
                <span className="absolute top-0 h-0.5 w-8 rounded-full bg-accent shadow-[0_0_12px_var(--accent)] animate-fade-in" />
              )}
              
              <span className="relative">
                <item.icon
                  active={isActive}
                  className={`h-5.5 w-5.5 transition-all duration-150 ${
                    isActive ? "scale-110 drop-shadow-[0_0_6px_rgba(204,255,0,.45)]" : "opacity-80"
                  }`}
                  strokeWidth={isActive ? 2.1 : 1.8}
                />
                {item.href === "/jogadores" && unreadRoster > 0 && (
                  <span className="absolute -right-2.5 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full border border-background bg-danger px-1 text-[8px] font-black leading-none text-white shadow-lg">
                    {unreadRoster > 99 ? "99+" : unreadRoster}
                  </span>
                )}
                {item.href.startsWith("/coletiva") && collective && collective.unreadCount > 0 && (
                  <span className="absolute -right-2.5 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full border border-background bg-danger px-1 text-[8px] font-black leading-none text-white shadow-lg">
                    {collective.unreadCount > 99 ? "99+" : collective.unreadCount}
                  </span>
                )}
                {"notification" in item && Boolean(item.notification) && (
                  <span className="absolute -right-1.5 -top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-accent shadow-[0_0_8px_rgba(204,255,0,.65)]" />
                )}
              </span>
              <span
                className={`block w-full truncate whitespace-nowrap text-center font-semibold leading-none tracking-tight transition-colors duration-150 ${
                  "text-[9px] min-[390px]:text-[10px]"
                } ${
                  isActive ? "text-accent" : ""
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
