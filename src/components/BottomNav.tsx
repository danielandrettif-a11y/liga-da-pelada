"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Home, ClipboardList, Trophy, Users, MoreHorizontal, ArrowLeftRight } from "@/components/icons";

const NAV_ITEMS = [
  { href: "/", label: "Início", icon: Home },
  { href: "/cartola", label: "Cartola", icon: ClipboardList },
  { href: "/ranking", label: "Ranking", icon: Trophy },
  { href: "/jogadores", label: "Elenco", icon: Users },
  { href: "/pagamentos", label: "Transfermarket", icon: ArrowLeftRight },
  { href: "/mais", label: "Mais", icon: MoreHorizontal },
] as const;

export function BottomNav({
  isAuthenticated,
  hasOpenCallup,
  hasReleasedPayment,
  newRosterCount,
}: {
  isAuthenticated: boolean;
  hasOpenCallup: boolean;
  hasReleasedPayment: boolean;
  newRosterCount: number;
}) {
  const pathname = usePathname();
  const [unreadRoster, setUnreadRoster] = useState(newRosterCount);
  useEffect(() => setUnreadRoster(newRosterCount), [newRosterCount]);
  useEffect(() => {
    const clearRosterBadge = () => setUnreadRoster(0);
    window.addEventListener("roster-unread-cleared", clearRosterBadge);
    return () => window.removeEventListener("roster-unread-cleared", clearRosterBadge);
  }, []);
  useEffect(() => {
    if (pathname.startsWith("/admin/jogadores")) setUnreadRoster(0);
  }, [pathname]);
  const baseItems = [...NAV_ITEMS];
  const contextualItems = baseItems.filter((item) => item.href !== "/pagamentos" || hasReleasedPayment);
  const visibleItems = isAuthenticated
    ? contextualItems
    : contextualItems.filter((item) => item.href !== "/mais");

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      <div
        className="mx-auto grid h-16 w-full max-w-lg items-stretch px-1"
        style={{ gridTemplateColumns: `repeat(${visibleItems.length}, minmax(0, 1fr))` }}
      >
        {visibleItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              className={`
                relative flex min-w-0 overflow-hidden flex-col items-center justify-center gap-1 rounded-xl px-0.5 py-1.5
                transition-all duration-200
                ${isActive
                  ? "text-accent"
                  : "text-muted hover:text-foreground/70"
                }
              `}
            >
              {/* Active indicator dot */}
              {isActive && (
                <span className="absolute top-0 h-0.5 w-8 rounded-full bg-accent shadow-[0_0_12px_var(--accent)] animate-fade-in" />
              )}
              
              <span className="relative">
                <item.icon
                  active={isActive}
                  className={`h-5.5 w-5.5 transition-all duration-200 ${
                    isActive ? "scale-110 drop-shadow-[0_0_6px_rgba(204,255,0,.45)]" : "opacity-80"
                  }`}
                  strokeWidth={isActive ? 2.1 : 1.8}
                />
                {item.href === "/jogadores" && unreadRoster > 0 && (
                  <span className="absolute -right-2.5 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full border border-background bg-danger px-1 text-[8px] font-black leading-none text-white shadow-lg">
                    {unreadRoster > 99 ? "99+" : unreadRoster}
                  </span>
                )}
              </span>
              <span
                className={`block w-full truncate whitespace-nowrap text-center font-semibold leading-none tracking-tight ${
                  item.label === "Transfermarket"
                    ? "text-[7px] min-[360px]:text-[8px] min-[430px]:text-[9px]"
                    : "text-[9px] min-[390px]:text-[10px]"
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
