"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, CalendarDays, Trophy, Users, MoreHorizontal } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Início", icon: Home },
  { href: "/rodadas", label: "Rodadas", icon: CalendarDays },
  { href: "/ranking", label: "Ranking", icon: Trophy },
  { href: "/jogadores", label: "Jogadores", icon: Users },
  { href: "/mais", label: "Mais", icon: MoreHorizontal },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/90 backdrop-blur-xl safe-area-bottom">
      <div className="max-w-lg mx-auto flex items-center justify-around h-16 px-2">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex flex-col items-center justify-center gap-0.5 w-16 py-1.5 rounded-xl
                transition-all duration-200 relative
                ${isActive
                  ? "text-accent"
                  : "text-muted hover:text-foreground/70"
                }
              `}
            >
              {/* Active indicator dot */}
              {isActive && (
                <span className="absolute -top-1 w-1 h-1 rounded-full bg-accent animate-fade-in" />
              )}
              
              <item.icon
                className={`w-5 h-5 transition-transform duration-200 ${
                  isActive ? "scale-110" : ""
                }`}
                strokeWidth={isActive ? 2.5 : 2}
              />
              <span
                className={`text-[10px] font-semibold tracking-wide ${
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
